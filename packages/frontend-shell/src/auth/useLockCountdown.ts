import { useEffect, useState } from 'react';

// The wait of a PIN lock, counted down on screen. `lock(seconds)` starts it, `clear()` ends it.
export function useLockCountdown(): { locked: boolean; remaining: number; lock: (seconds: number) => void; clear: () => void } {
  const [lockedUntil, setLockedUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (lockedUntil <= Date.now()) {
      return undefined;
    }
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [lockedUntil]);

  const remaining = Math.max(0, Math.ceil((lockedUntil - now) / 1000));
  return {
    locked: lockedUntil > 0 && remaining > 0,
    remaining,
    lock: (seconds) => {
      setNow(Date.now());
      setLockedUntil(Date.now() + seconds * 1000);
    },
    clear: () => setLockedUntil(0),
  };
}
