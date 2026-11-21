// The one way the shell reads the JSON answer of an app-core route it calls with a raw fetch. A non-OK answer throws an Error whose
// text is the `message` the server wrote (it says what to do: delete a damaged file, choose a PIN...), with `status` on it; an answer
// without a message says what was called, the status and the usual cause (app-core restarting or down).
export async function readJson<T = unknown>(res: Response, what: string): Promise<T> {
  const text = await res.text();
  let data: unknown;
  let parsed = false;
  if (text.trim() !== '') {
    try {
      data = JSON.parse(text);
      parsed = true;
    } catch {
      // Not JSON: reported below with its status.
    }
  }
  if (!res.ok) {
    const message = parsed && typeof data === 'object' && data !== null ? (data as { message?: unknown }).message : undefined;
    throw Object.assign(new Error(typeof message === 'string' && message !== '' ? message : `${what} answered ${res.status} with no message: app-core may be restarting or down, retry in a few seconds, and read the server log if it persists.`), { status: res.status });
  }
  if (!parsed) {
    throw Object.assign(new Error(`${what} answered ${res.status} but not with JSON: the address may not be an app-core route, or app-core is older than this page. Restart app-core after updating it.`), { status: res.status });
  }
  return data as T;
}
