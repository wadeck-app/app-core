import type { Fetcher } from '@wadeck-app/dsl-renderer';

// What the user reads when the answer has no usable body: where it came from, the status, and the usual cause. A dev proxy (Vite on
// 5173 to app-core on 4850) answers an empty 500 while its target is down or restarting.
function noBodyMessage(method: string, path: string, status: number, statusText: string): string {
  return `${method} ${path} answered ${status}${statusText === '' ? '' : ` ${statusText}`} with no JSON body. app-core or the module backend may be restarting or down: retry in a few seconds, and read the server log if it persists.`;
}

// dsl-renderer's Fetcher receives a free-form "METHOD /path" string and does
// zero base-path resolution itself -- that is entirely this function's job.
// app-core's module routes are already absolute (/api/modules/<id>/...), so no
// prefix is needed; same-origin fetch resolves them correctly as-is.
export const fetcher: Fetcher = async (
  url: string,
  _params?: Record<string, string>,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<unknown> => {
  const spaceIdx = url.indexOf(' ');
  const method = spaceIdx >= 0 ? url.slice(0, spaceIdx) : 'GET';
  const path = spaceIdx >= 0 ? url.slice(spaceIdx + 1) : url;
  const res = await fetch(path, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...extraHeaders,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) {
    return undefined;
  }
  // The status is read before the body: an answer without JSON must still say what happened.
  const text = await res.text();
  let data: unknown;
  let parsed = false;
  if (text.trim() !== '') {
    try {
      data = JSON.parse(text);
      parsed = true;
    } catch {
      // Not JSON (a proxy's plain-text error, an HTML page): reported below with its status.
    }
  }
  if (!res.ok) {
    const { message, error } = (parsed && typeof data === 'object' && data !== null ? data : {}) as { message?: string; error?: string };
    const reason = message ?? error;
    if (reason === undefined) {
      throw Object.assign(new Error(noBodyMessage(method, path, res.status, res.statusText)), { status: res.status });
    }
    throw Object.assign(new Error(reason), { status: res.status });
  }
  if (!parsed) {
    // A successful answer with nothing in it is a valid "no content"; one that is not JSON is a wrong target (an HTML page for an API route).
    if (text.trim() === '') {
      return undefined;
    }
    throw Object.assign(new Error(`${method} ${path} answered ${res.status} but not with JSON (content-type "${res.headers.get('content-type') ?? 'none'}"): the address may not be an app-core route.`), { status: res.status });
  }
  return data;
};
