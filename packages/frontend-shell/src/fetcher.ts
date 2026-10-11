import type { Fetcher } from '@wadeck-app/dsl-renderer';

// Decision #26, confirmed by dsl-owner (cross-session, verified against dsl-view
// source): dsl-renderer's Fetcher receives a free-form "METHOD /path" string and
// does zero base-path resolution itself -- that is entirely this function's job.
// app-core's module routes are already absolute (/api/modules/<id>/...), so no
// prefix is needed; same-origin fetch resolves them correctly as-is. Mirrors
// orchestrator/packages/orch-app/src/fetcher.ts, the real working precedent.
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
  const data = await res.json();
  if (!res.ok) {
    const { message, error } = data as { message?: string; error?: string };
    throw Object.assign(new Error(message ?? error ?? res.statusText), { status: res.status });
  }
  return data;
};
