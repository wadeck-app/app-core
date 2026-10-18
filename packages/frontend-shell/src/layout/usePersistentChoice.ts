import { useState } from 'react';

// One value among `options`, kept in localStorage. An unknown stored value is reported (never silently used) and `initial` applies.
export function usePersistentChoice<T extends string>(key: string, options: readonly T[], initial: T, label: string): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    const stored = localStorage.getItem(key);
    if (stored === null) return initial;
    if ((options as readonly string[]).includes(stored)) return stored as T;
    console.warn(`[layout] Ignoring unknown ${label} "${stored}" in localStorage "${key}"; expected one of: ${options.join(', ')}.`);
    return initial;
  });
  const choose = (v: T): void => {
    localStorage.setItem(key, v);
    setValue(v);
  };
  return [value, choose];
}
