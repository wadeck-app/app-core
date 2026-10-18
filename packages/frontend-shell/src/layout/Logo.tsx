import React, { useRef } from 'react';
import { LOGO_FONT_STYLE, useLogoFontValue } from './logoFont.js';
import { useOpticalCenter } from './opticalCenter.js';

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

// Letters fill the chip: large font, no vertical room, and a width that follows the text (min = square).
const SIZES = {
  sm: 'h-5 min-w-[20px] px-[3px] text-[11px]',
  lg: 'h-6 min-w-[24px] px-[3px] text-[13px]',
  md: 'h-8 min-w-[32px] px-1 text-[15px]',
} as const;

// solid = module color behind white letters. muted = greyed out.
// inverted = white chip, module-colored letters (for use on a colored pill).
// swapped = foreground and background exchanged: page-colored chip, module-colored letters and border.
// outline = transparent chip, module-colored letters and border.
export type LogoTone = 'solid' | 'muted' | 'inverted' | 'swapped' | 'outline';

interface LogoProps {
  title: string;
  moduleId: string;
  mode: LogoMode;
  // Tailwind background class used when the mode is not 'duo-colored'.
  baseColor: string;
  size?: keyof typeof SIZES;
  tone?: LogoTone;
  ring?: boolean;
  glow?: boolean;
}

function toneStyle(tone: LogoTone, glow: boolean, color: string): React.CSSProperties {
  switch (tone) {
    case 'inverted':
      return { backgroundColor: '#ffffff', color };
    case 'swapped':
      return { backgroundColor: 'var(--color-surface)', color, boxShadow: `inset 0 0 0 2px ${color}` };
    case 'outline':
      return { backgroundColor: 'transparent', color, boxShadow: `inset 0 0 0 1.5px ${color}` };
    default:
      return { backgroundColor: color, boxShadow: glow ? `0 0 0 4px ${color}40` : undefined };
  }
}

export function Logo({ title, moduleId, mode, baseColor, size = 'md', tone = 'solid', ring = false, glow = false }: LogoProps): React.ReactElement {
  const colored = mode === 'duo-colored';
  const text = logoOf(title, mode);
  const font = LOGO_FONT_STYLE[useLogoFontValue()];
  const inner = useRef<HTMLSpanElement>(null);
  useOpticalCenter(inner, text, font.optical, [size, font.className]);
  return (
    <span
      aria-hidden="true"
      data-logo={text}
      data-tone={tone}
      style={colored ? toneStyle(tone, glow, moduleColor(moduleId)) : undefined}
      className={`grid shrink-0 place-items-center overflow-hidden rounded-md font-bold leading-none text-white transition-all ${font.className} ${SIZES[size]} ${
        colored ? '' : baseColor
      } ${tone === 'muted' ? 'opacity-50 grayscale' : ''} ${ring ? 'ring-2 ring-primary-solid ring-offset-2 ring-offset-surface' : ''}`}
    >
      <span ref={inner} className="inline-block whitespace-nowrap">
        {font.cells
          ? Array.from(text).map((ch, i) => (
              // Equal-width cell per letter: each letter is centered in its own cell, whatever its width.
              <span key={i} className="inline-block w-[0.72em] text-center">
                {ch}
              </span>
            ))
          : text}
      </span>
    </span>
  );
}
