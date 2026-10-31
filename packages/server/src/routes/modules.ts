import type { FastifyInstance, FastifyReply } from 'fastify';
import * as path from 'node:path';
import { getErrorMessage } from '../errors.js';
import { SharedVersionError } from '../dslLib.js';
import { ManifestIdMismatchError, parseRegistrationPayload, parseUnregisterPayload, UnsupportedSourceTypeError } from '../manifest.js';
import { hasRegistryEntry, removeRegistryEntry, writeRegistryEntry, type RegistryEntry } from '../registry.js';
import { ManifestFileError, ModuleRequirementError, newChangeReport, type ChangeReport, type ModuleManager } from '../loader.js';
import { ZodError } from 'zod';
import { receivedPathHint } from '../pathHint.js';
import { etagHook } from '../conditionalGet.js';

export interface ModulesRoutesOptions {
  modulesDir: string;
  manager: ModuleManager;
}

// A 400 whose message already says what is wrong and where; `issues` keeps the raw validation detail.
class InvalidRequestError extends Error {
  constructor(
    message: string,
    readonly issues: unknown[],
  ) {
    super(message);
  }
}

// What a register/update that did not succeed tells the caller besides the error itself.
interface Rejection {
  retained: boolean;
  note: string;
}

class RegistrationFailure extends Error {
  constructor(
    readonly original: unknown,
    readonly rejection: Rejection,
  ) {
    super(getErrorMessage(original));
  }
}

// "field.path: reason; other.path: reason." for a validation error.
function describeIssues(err: ZodError): string {
  const parts = err.issues.map((issue) => `${issue.path.length === 0 ? '(root)' : issue.path.join('.')}: ${issue.message}`);
  return `${parts.join('; ')}.`;
}

// Decides what happens to the registry entry of a registration that did not succeed, and says so.
// - a required module is missing or does not fit and the module is not running: the registration is kept
//   (the module stays registered and failed, and loads by itself when the requirement is met);
// - the running version was torn down and the new one did not start: the entry is kept, the module is failed;
// - anything else was refused before anything changed: the registry is left as it was (a new module leaves no entry).
function settleRejection(id: string, entry: RegistryEntry, report: ChangeReport, modulesDir: string, manager: ModuleManager): Rejection {
  const serving = manager.get(id);
  if (report.failure === 'requirement' && serving === undefined) {
    writeRegistryEntry(modulesDir, entry);
    return {
      retained: true,
      note: `The registration is kept: "${id}" stays registered and failed, and is loaded automatically as soon as the modules it requires are loaded and compatible.`,
    };
  }
  if (report.failure === 'failed') {
    writeRegistryEntry(modulesDir, entry);
    return {
      retained: true,
      note: `The registration is kept: "${id}" stays registered and failed. It is not retried automatically: fix the module, then register it again.`,
    };
  }
  if (serving !== undefined) {
    return { retained: false, note: `The registration was not kept: version ${serving.manifest.version} of "${id}" keeps serving and its registry entry is unchanged.` };
  }
  if (hasRegistryEntry(modulesDir, id)) {
    return { retained: false, note: `The registration was not kept: the registry entry of "${id}" is unchanged.` };
  }
  // Nothing registered and nothing running: the recorded failure would outlive a restart, so it is not listed either.
  manager.clearFailure(id);
  return { retained: false, note: `Nothing was registered: "${id}" has no registry entry. Fix the problem above, then register it again.` };
}

// A manifest that cannot be read: the message names the path the server read; when that differs from what the caller sent
// (a Git Bash path, a relative one), it also names what was sent and the form that works.
function withReceivedPath(err: ManifestFileError, received: string, resolved: string): ManifestFileError {
  const hint = receivedPathHint(received, resolved);
  return hint === '' ? err : new ManifestFileError(`${err.message} ${hint}`);
}

async function handleRegisterOrUpdate(
  body: unknown,
  modulesDir: string,
  manager: ModuleManager,
  report: ChangeReport,
): Promise<{ id: string; version: string; extensionPoints: number; held?: string[] }> {
  // A ZodError here is a bad request body: sendError words it as such.
  const payload = parseRegistrationPayload(body);
  const manifestPath = path.resolve(payload.source.path);
  const entry: RegistryEntry = { id: payload.id, source: { type: 'file', path: manifestPath } };

  let loaded;
  try {
    loaded = await manager.loadFromEntry(entry, report);
  } catch (err) {
    // The request was fine; the manifest file it points at is not.
    const original =
      err instanceof ManifestFileError
        ? withReceivedPath(err, payload.source.path, manifestPath)
        : err instanceof ZodError
        ? new InvalidRequestError(
            `module "${payload.id}": the manifest ${manifestPath} is invalid: ${describeIssues(err)} Run "app-core-cli validate ${manifestPath}" for the same check, fix the manifest and register again.`,
            err.issues,
          )
        : err;
    throw new RegistrationFailure(original, settleRejection(payload.id, entry, report, modulesDir, manager));
  }
  // app-core itself writes/updates the registry file on a successful push --
  // the push path and the fallback-file path converge on the exact same
  // storage, so there is no separate reconciliation step.
  writeRegistryEntry(modulesDir, entry);
  // `held`: what this update keeps in memory for good (an ES module backend); absent when the previous copy was let go.
  return { id: loaded.id, version: loaded.manifest.version, extensionPoints: loaded.resolvedViews.length, ...(loaded.held.length > 0 ? { held: loaded.held } : {}) };
}

export async function modulesRoutes(server: FastifyInstance, opts: ModulesRoutesOptions): Promise<void> {
  const { modulesDir, manager } = opts;

  const registration = (status: number) => async (req: { body: unknown }, reply: FastifyReply) => {
    const report = newChangeReport();
    try {
      const result = await handleRegisterOrUpdate(req.body, modulesDir, manager, report);
      return reply.code(status).send({ ...result, cascaded: report.cascaded, recovered: report.recovered });
    } catch (err) {
      if (err instanceof RegistrationFailure) {
        return sendError(reply, err.original, { retained: err.rejection.retained, cascaded: report.cascaded, recovered: report.recovered }, err.rejection.note);
      }
      return sendError(reply, err);
    }
  };

  server.post('/api/modules/register', registration(201));
  server.post('/api/modules/update', registration(200));

  // Removes a module for good: stops routing to it, disposes its moduleContext and deletes its
  // registry file, so it does not come back on the next start. A daemon calls this on uninstall.
  // The modules that require it are unloaded first (listed in `cascaded`) and stay registered.
  server.post('/api/modules/unregister', async (req, reply) => {
    try {
      const { id } = parseUnregisterPayload(req.body);
      const report = newChangeReport();
      const hadRegistryFile = removeRegistryEntry(modulesDir, id);
      const wasKnown = await manager.forget(id, report);
      if (!wasKnown && !hadRegistryFile) {
        return reply.code(404).send({
          error: `Module "${id}" is not registered. GET /api/modules lists the loaded modules and the ones that failed to load.`,
        });
      }
      return reply.code(200).send({ id, removed: true, cascaded: report.cascaded, recovered: report.recovered });
    } catch (err) {
      return sendError(reply, err);
    }
  });

  // Internal inspection endpoint for tests/dashboard -- lists currently loaded
  // modules and their resolved views (views are DSL data, not code), plus the modules
  // whose registration exists but failed to load, with the reason and its kind (`cause`:
  // "requirement" is retried automatically, "error" is not).
  server.get('/api/modules', { onSend: etagHook }, async (_req, reply) => {
    const modules = manager.list().map((m) => ({
      id: m.id,
      version: m.manifest.version,
      extensionPoints: m.resolvedViews,
      dslLib: m.dslLib,
      // Always present for the shell (the manifest field is optional and means true when absent).
      showInNav: m.manifest.showInNav ?? true,
      // Only when the manifest names the module; the shell derives a title from the id otherwise.
      ...(m.manifest.title === undefined ? {} : { title: m.manifest.title }),
    }));
    return reply.code(200).send({ modules, failed: manager.listFailed() });
  });
}

function sendError(reply: FastifyReply, err: unknown, extra: Record<string, unknown> = {}, note?: string) {
  const message = (text: string): string => (note === undefined ? text : `${text}\n${note}`);
  if (err instanceof UnsupportedSourceTypeError) {
    return reply.code(422).send({ error: message(getErrorMessage(err)), ...extra });
  }
  if (err instanceof ManifestIdMismatchError || err instanceof ManifestFileError) {
    return reply.code(400).send({ error: message(getErrorMessage(err)), ...extra });
  }
  if (err instanceof ModuleRequirementError) {
    return reply.code(422).send({ error: message(getErrorMessage(err)), ...extra });
  }
  // The module's dsl-lib was built for other versions of the shared packages than the shell provides: 422 and a code, so a
  // daemon that registers can tell "rebuild me" from a server fault.
  if (err instanceof SharedVersionError) {
    return reply.code(422).send({ error: message(getErrorMessage(err)), code: err.code, ...extra });
  }
  if (err instanceof InvalidRequestError) {
    return reply.code(400).send({ error: message(getErrorMessage(err)), issues: err.issues, ...extra });
  }
  if (err instanceof ZodError) {
    return reply.code(400).send({ error: message(`Invalid payload: ${describeIssues(err)} Fix the request body.`), issues: err.issues, ...extra });
  }
  return reply.code(500).send({ error: message(getErrorMessage(err)), ...extra });
}
