import { readJson } from './readJson.js';

// What GET /api/auth/status says about the PIN (server/src/auth/routes.ts), for the dialogs and the PIN menu.
export interface PinStatus {
  pinSet: boolean;
  // Absent when the server is older than this page.
  resetHint?: { files: string[]; instruction: string };
  minPinLength?: number;
  maxPinLength?: number;
}

// "at least 4 characters, at most 12" from what the server says; empty when it says nothing (a server older than this page).
export function lengthRule(min: number | undefined, max: number | undefined): string {
  return [min === undefined ? '' : `at least ${min} characters`, max === undefined ? '' : `at most ${max}`].filter((part) => part !== '').join(', ');
}

export async function readPinStatus(): Promise<PinStatus> {
  const res = await fetch('/api/auth/status');
  const body = await readJson<{ pinSet?: unknown; resetHint?: { files?: unknown; instruction?: unknown }; minPinLength?: unknown; maxPinLength?: unknown }>(res, 'GET /api/auth/status');
  if (typeof body.pinSet !== 'boolean') {
    throw new Error('GET /api/auth/status has no boolean "pinSet"; the server is older than this frontend. Restart app-core after updating it.');
  }
  const hint = body.resetHint;
  const validHint = hint !== undefined && Array.isArray(hint.files) && hint.files.every((f) => typeof f === 'string') && typeof hint.instruction === 'string';
  return {
    pinSet: body.pinSet,
    ...(validHint ? { resetHint: { files: hint.files as string[], instruction: hint.instruction as string } } : {}),
    ...(typeof body.minPinLength === 'number' ? { minPinLength: body.minPinLength } : {}),
    ...(typeof body.maxPinLength === 'number' ? { maxPinLength: body.maxPinLength } : {}),
  };
}
