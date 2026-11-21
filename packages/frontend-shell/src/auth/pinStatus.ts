// What GET /api/auth/status says about the PIN (server/src/auth/routes.ts), for the dialogs and the PIN menu.
export interface PinStatus {
  pinSet: boolean;
  // Absent when the server is older than this page.
  resetHint?: { files: string[]; instruction: string };
  minPinLength?: number;
}

export async function readPinStatus(): Promise<PinStatus> {
  const res = await fetch('/api/auth/status');
  if (!res.ok) {
    throw new Error(`GET /api/auth/status answered ${res.status}. app-core may be restarting or down: retry in a few seconds.`);
  }
  const body = (await res.json()) as { pinSet?: unknown; resetHint?: { files?: unknown; instruction?: unknown }; minPinLength?: unknown };
  if (typeof body.pinSet !== 'boolean') {
    throw new Error('GET /api/auth/status has no boolean "pinSet"; the server is older than this frontend. Restart app-core after updating it.');
  }
  const hint = body.resetHint;
  const validHint = hint !== undefined && Array.isArray(hint.files) && hint.files.every((f) => typeof f === 'string') && typeof hint.instruction === 'string';
  return {
    pinSet: body.pinSet,
    ...(validHint ? { resetHint: { files: hint.files as string[], instruction: hint.instruction as string } } : {}),
    ...(typeof body.minPinLength === 'number' ? { minPinLength: body.minPinLength } : {}),
  };
}
