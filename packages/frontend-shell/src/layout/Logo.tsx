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

// Second hue for two-tone gradients: 4 steps further in the palette, far enough to read as another color, and
// stable per module like the first one.
export const moduleColor2 = (id: string): string => PALETTE[(paletteIndex(id) + 4) % PALETTE.length];

// Letters fill the chip: large font, no vertical room, and a width that follows the text (min = square).
// The one size of a logo everywhere in the app.
const SIZE = 'h-5 min-w-[20px] px-[3px] text-[11px]';

// solid = module color behind white letters. muted = greyed out.
// inverted = white chip, module-colored letters (for use on a colored pill).
// swapped = foreground and background exchanged: page-colored chip, module-colored letters and border.
// outline = transparent chip, module-colored letters and border.
// glass = translucent white chip, white letters (for use on a chip filled with the module color).
// duotone = diagonal gradient from the module color to its second hue.
export type LogoTone = 'solid' | 'muted' | 'inverted' | 'swapped' | 'outline' | 'glass' | 'duotone';

interface LogoProps {
  title: string;
  moduleId: string;
  tone?: LogoTone;
  ring?: boolean;
  glow?: boolean;
}

function toneStyle(tone: LogoTone, glow: boolean, color: string, color2: string): React.CSSProperties {
  switch (tone) {
    case 'duotone':
      return { backgroundImage: `linear-gradient(135deg, ${color}, ${color2})` };
    case 'inverted':
      return { backgroundColor: '#ffffff', color };
    case 'swapped':
      return { backgroundColor: 'var(--color-surface)', color, boxShadow: `inset 0 0 0 2px ${color}` };
    case 'outline':
      return { backgroundColor: 'transparent', color, boxShadow: `inset 0 0 0 1.5px ${color}` };
    case 'glass':
      return { backgroundColor: 'rgba(255, 255, 255, 0.25)', color: '#ffffff' };
    default:
      return { backgroundColor: color, boxShadow: glow ? `0 0 0 4px ${color}40` : undefined };
  }
}

export function Logo({ title, moduleId, tone = 'solid', ring = false, glow = false }: LogoProps): React.ReactElement {
  const text = logoOf(title);
  const inner = useRef<HTMLSpanElement>(null);
  // Optical centering: the text box is centered on its advance width, which leaves pairs like "BI" or "RE" visibly
  // off-center. The visible ink is measured and shifted instead (see opticalCenter.ts).
  useOpticalCenter(inner, text, true, []);
  return (
    <span
      aria-hidden="true"
      data-logo={text}
      data-tone={tone}
      style={toneStyle(tone, glow, moduleColor(moduleId), moduleColor2(moduleId))}
      className={`grid shrink-0 place-items-center overflow-hidden rounded-md font-bold leading-none tracking-tighter text-white transition-all ${SIZE} ${
        tone === 'muted' ? 'opacity-50 grayscale' : ''
      } ${ring ? 'ring-2 ring-primary-solid ring-offset-2 ring-offset-surface' : ''}`}
    >
      <span ref={inner} className="inline-block whitespace-nowrap">
        {text}
      </span>
    </span>
  );
}
