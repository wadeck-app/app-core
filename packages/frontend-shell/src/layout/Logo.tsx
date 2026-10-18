import React from 'react';

// 'initial' = 1 letter (D2, D3); 'duo' = 2 letters; 'duo-colored' = 2 letters on the module's own color.
export type LogoMode = 'initial' | 'duo' | 'duo-colored';

// Single word -> its first two letters ("Queue" -> "QU"); several words -> first letter of the first two ("Audit log" -> "AL").
export function logoOf(title: string, mode: LogoMode = 'duo'): string {
  const words = title.split(/[\s_-]+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (mode === 'initial') return words[0].charAt(0).toUpperCase();
  const letters = words.length > 1 ? words[0].charAt(0) + words[1].charAt(0) : words[0].slice(0, 2);
  return letters.toUpperCase();
}

// Tailwind 600 shades: each keeps white text readable (contrast >= 3.5) on its own.
const PALETTE = ['#e11d48', '#ea580c', '#d97706', '#059669', '#0d9488', '#0284c7', '#4f46e5', '#7c3aed', '#c026d3'] as const;

// Stable per module id: the same module keeps its color across reloads, in its logo and as the app accent.
export function moduleColor(id: string): string {
  // FNV-1a then the murmur3 finalizer. Measured: `hash * 31 + c`, and FNV-1a alone, both sent about half of
  // the short ids to the same palette entry once reduced modulo 9.
  let hash = 2166136261;
  for (const ch of id) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619) >>> 0;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return PALETTE[(hash >>> 0) % PALETTE.length];
}

const SIZES = { sm: 'h-5 w-5 text-[9px]', md: 'h-8 w-8 text-[11px]' } as const;

interface LogoProps {
  title: string;
  moduleId: string;
  mode: LogoMode;
  // Tailwind background class used when the mode is not 'duo-colored'.
  baseColor: string;
  size?: keyof typeof SIZES;
}

export function Logo({ title, moduleId, mode, baseColor, size = 'md' }: LogoProps): React.ReactElement {
  const colored = mode === 'duo-colored';
  return (
    <span
      aria-hidden="true"
      data-logo={logoOf(title, mode)}
      style={colored ? { backgroundColor: moduleColor(moduleId) } : undefined}
      className={`grid shrink-0 place-items-center rounded-md font-bold tracking-tight text-white ${SIZES[size]} ${colored ? '' : baseColor}`}
    >
      {logoOf(title, mode)}
    </span>
  );
}
