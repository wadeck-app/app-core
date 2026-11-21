import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { cliTokenPath, CLI_TOKEN_HEADER } from '../cliToken.js';
import { refuseUnlessElevated } from './guard.js';

// 'warn': a request without credentials is accepted and logged once per module id; 'enforce': it is refused.
export type RegisterProtection = 'warn' | 'enforce';

export const REQUIRE_CLI_TOKEN_ENV = 'APP_CORE_REQUIRE_CLI_TOKEN';

// The mode from the option (tests) or from APP_CORE_REQUIRE_CLI_TOKEN: "1" enforces, "0" or nothing warns, anything else is refused.
export function resolveRegisterProtection(option: boolean | undefined, env: NodeJS.ProcessEnv = process.env): RegisterProtection {
  if (option !== undefined) {
    return option ? 'enforce' : 'warn';
  }
  const value = env[REQUIRE_CLI_TOKEN_ENV];
  if (value === undefined || value === '' || value === '0') {
    return 'warn';
  }
  if (value === '1') {
    return 'enforce';
  }
  throw new Error(`${REQUIRE_CLI_TOKEN_ENV}="${value}" is not understood. Use ${REQUIRE_CLI_TOKEN_ENV}=1 to refuse registrations without the machine token, or leave it unset (or 0) to only warn.`);
}

// Constant-time: both sides are hashed first so the comparison does not depend on the length of what was sent.
function sameToken(expected: string, presented: string): boolean {
  return timingSafeEqual(createHash('sha256').update(expected).digest(), createHash('sha256').update(presented).digest());
}

export interface RegisterGuardOptions {
  configDir: string;
  token: string;
  mode: RegisterProtection;
  now?: (() => number) | undefined;
}

// preHandler of register / update / unregister (the body is parsed, so the module id can be named).
//  - X-App-Core-Token present and right: accepted; present and wrong: 401 cli-token-invalid, in both modes;
//  - no token, but a valid PIN access token (Authorization: Bearer): accepted;
//  - nothing: 'enforce' says 401 cli-token-required, 'warn' accepts and logs one line per module id (for the life of the server).
export function createRegisterGuard(options: RegisterGuardOptions): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  const { configDir, token, mode } = options;
  const warned = new Set<string>();
  return async (request, reply) => {
    const presented = request.headers[CLI_TOKEN_HEADER.toLowerCase()];
    if (presented !== undefined) {
      if (typeof presented === 'string' && sameToken(token, presented)) {
        return;
      }
      return void reply.code(401).send({
        error: 'cli-token-invalid',
        message: `The ${CLI_TOKEN_HEADER} of this request is not the machine token of this app-core. Read it again from ${cliTokenPath(configDir)} (it is created when app-core starts; a server on another config dir has another one), or use the SDK registerModule, which does.`,
      });
    }
    if (refuseUnlessElevated(configDir, request.headers.authorization, options.now) === undefined) {
      return;
    }
    if (mode === 'enforce') {
      return void reply.code(401).send({
        error: 'cli-token-required',
        message: `This request carries no machine token. Register with the SDK registerModule (@wadeck-app/app-core-sdk/register), which sends it, or read ${cliTokenPath(configDir)} and send its content in the ${CLI_TOKEN_HEADER} header. (${REQUIRE_CLI_TOKEN_ENV}=1 is set on this server.)`,
      });
    }
    const body = request.body as { id?: unknown } | null | undefined;
    const id = typeof body?.id === 'string' && body.id !== '' ? body.id : '(no id in the request)';
    if (!warned.has(id)) {
      warned.add(id);
      process.stderr.write(
        `[app-core] module "${id}" registered without the machine token: update its @wadeck-app/app-core-sdk (registerModule sends it since the version that carries cli-token) or its CLI; this will be refused when ${REQUIRE_CLI_TOKEN_ENV}=1\n`,
      );
    }
  };
}
