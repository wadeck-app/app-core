import { useEffect, useRef, useState } from 'react';

// One value among `options`, kept in localStorage.
// - An unknown stored value (or URL value) is reported, never silently used; `initial` applies.
// - `urlParam` lets a link force the value (`?ab.tab=pill`): it wins over the stored value for this page load and is not
//   stored by itself, only a later choice is.
// - A change made in another tab of the same origin is applied here too (the `storage` event).
export function usePersistentChoice<T extends string>(key: string, options: readonly T[], initial: T, label: string, urlParam?: string): [T, (v: T) => void] {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const isOption = (v: string): v is T => (options as readonly string[]).includes(v);
  const expected = `expected one of: ${options.join(', ')}.`;

  const [value, setValue] = useState<T>(() => {
    const fromUrl = urlParam ? new URLSearchParams(window.location.search).get(urlParam) : null;
    if (fromUrl !== null) {
      if (isOption(fromUrl)) return fromUrl;
      console.warn(`[layout] Ignoring unknown ${label} "${fromUrl}" in the URL parameter "${urlParam}"; ${expected}`);
    }
    const stored = localStorage.getItem(key);
    if (stored === null) return initial;
    if (isOption(stored)) return stored;
    console.warn(`[layout] Ignoring unknown ${label} "${stored}" in localStorage "${key}"; ${expected}`);
    return initial;
  });

  useEffect(() => {
    const onStorage = (e: StorageEvent): void => {
      if (e.storageArea !== localStorage || e.key !== key || e.newValue === null) return;
      if ((optionsRef.current as readonly string[]).includes(e.newValue)) setValue(e.newValue as T);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [key]);

  const choose = (v: T): void => {
    localStorage.setItem(key, v);
    setValue(v);
  };
  return [value, choose];
}
