import { isPinSet, PIN_NOT_SET_MESSAGE } from './pin.js';
import { verifyAccessToken } from './tokens.js';

// What a `sensitive` route needs before its handler runs. Returns the refusal, or undefined when the request may go on.
//  - no PIN chosen yet: 403 pin-not-set (nothing can unlock the route; the message says to choose it in the dashboard or with the CLI);
//  - a PIN, but no valid access token: 401 elevation-required (the shell asks the PIN and repeats the request).
export interface Refusal {
  status: 401 | 403;
  body: { error: 'pin-not-set' | 'elevation-required'; message: string };
}

export function bearerTokenOf(authorization: string | undefined): string | undefined {
  const match = /^Bearer ([^\s]+)$/.exec(authorization ?? '');
  return match?.[1];
}

export function refuseUnlessElevated(configDir: string, authorization: string | undefined, now: () => number = Date.now): Refusal | undefined {
  if (!isPinSet(configDir)) {
    return { status: 403, body: { error: 'pin-not-set', message: PIN_NOT_SET_MESSAGE } };
  }
  const token = bearerTokenOf(authorization);
  const verdict = token === undefined ? undefined : verifyAccessToken(configDir, token, now);
  if (verdict?.ok === true) {
    return undefined;
  }
  const why = token === undefined ? 'no access token came with the request' : `the access token is not accepted (${verdict?.ok === false ? verdict.reason : 'unknown'})`;
  return {
    status: 401,
    body: { error: 'elevation-required', message: `This action needs the PIN: ${why}. Enter the PIN in the dashboard (POST /api/auth/pin), then repeat the request with "Authorization: Bearer <accessToken>".` },
  };
}
