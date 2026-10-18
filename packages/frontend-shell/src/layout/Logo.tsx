import React, { useRef } from 'react';
import { useOpticalCenter } from './opticalCenter.js';

// Two letters per module: a single word -> its first two letters ("Queue" -> "QU"); several words -> first letter of
// the first two ("Audit log" -> "AL").
export function logoOf(title: string): string {
  const words = title.split(/[\s_-]+/).filter(Boolean);
  if (words.length === 0) return '?';
  const letters = words.length > 1 ? words[0].charAt(0) + words[1].charAt(0) : words[0].slice(0, 2);
  return letters.toUpperCase();
}

// Tailwind 600 shades: each keeps white text readable (contrast >= 3.5) on its own.
const PALETTE = ['#e11d48', '#ea580c', '#d97706', '#059669', '#0d9488', '#0284c7', '#4f46e5', '#7c3aed', '#c026d3'] as const;

// Stable per module id: the same module keeps its color across reloads, in its logo and as the app accent.
function paletteIndex(id: string): number {
  // FNV-1a then the murmur3 finalizer. Measured: `hash * 31 + c`, and FNV-1a alone, both sent about half of
  // the short ids to the same palette entry once reduced modulo 9.
  let hash = 2166136261;
  for (const ch of id) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619) >>> 0;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return (hash >>> 0) % PALETTE.length;
}

export const moduleColor = (id: string): string => PALETTE[paletteIndex(id)];

// Letters fill the chip: large font, no vertical room, and a width that follows the text (min = square).
// The one size of a logo everywhere in the app.
const SIZE = 'h-5 min-w-[20px] px-[3px] text-[11px]';

export function Logo({ title, moduleId }: { title: string; moduleId: string }): React.ReactElement {
  const text = logoOf(title);
  const inner = useRef<HTMLSpanElement>(null);
  // Optical centering: the text box is centered on its advance width, which leaves pairs like "BI" or "RE" visibly
  // off-center. The visible ink is measured and shifted instead (see opticalCenter.ts).
  useOpticalCenter(inner, text, true, []);
  return (
    <span
      aria-hidden="true"
      data-logo={text}
      style={{ backgroundColor: moduleColor(moduleId) }}
      className={`grid shrink-0 place-items-center overflow-hidden rounded-md font-bold leading-none tracking-tighter text-white ${SIZE}`}
    >
      <span ref={inner} className="inline-block whitespace-nowrap">
        {text}
      </span>
    </span>
  );
}
