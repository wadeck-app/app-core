import { useCallback, useState } from 'react';

// Boolean kept in localStorage ("1" / "0"), e.g. a collapsed sidebar surviving a reload.
export function usePersistentFlag(key: string, initial = false): [boolean, () => void] {
  const [value, setValue] = useState<boolean>(() => {
    const stored = localStorage.getItem(key);
    return stored === null ? initial : stored === '1';
  });
  const toggle = useCallback(() => {
    setValue((v) => {
      localStorage.setItem(key, v ? '0' : '1');
      return !v;
    });
  }, [key]);
  return [value, toggle];
}
