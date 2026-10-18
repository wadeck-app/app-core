import { createContext, useContext } from 'react';
import { usePersistentChoice } from './usePersistentChoice.js';

// Font and centering strategy of the 2-letter logos (A/B tested).
export const LOGO_FONTS = {
  inter: 'Inter',
  optical: 'Optical',
  mono: 'Mono',
  cells: 'Cells',
  serif: 'Serif',
} as const;
export type LogoFont = keyof typeof LOGO_FONTS;

export const LOGO_FONT_KEY = 'shell.logoFont';

export const useLogoFont = (): [LogoFont, (f: LogoFont) => void] =>
  usePersistentChoice(LOGO_FONT_KEY, Object.keys(LOGO_FONTS) as LogoFont[], 'inter', 'logo font');

export interface LogoFontStyle {
  className: string;
  // Offset the ink so it is centered in the chip, measured on the real glyphs.
  optical: boolean;
  // Each letter in its own equal-width cell, centered in it.
  cells: boolean;
}

export const LOGO_FONT_STYLE: Record<LogoFont, LogoFontStyle> = {
  inter: { className: 'tracking-tighter', optical: false, cells: false },
  optical: { className: 'tracking-tighter', optical: true, cells: false },
  // Monospace: every letter has the same advance, so any pair fills the chip alike.
  mono: { className: 'font-mono tracking-tight', optical: false, cells: false },
  cells: { className: '', optical: false, cells: true },
  serif: { className: 'font-serif tracking-tight', optical: true, cells: false },
};

export const LogoFontContext = createContext<LogoFont>('inter');
export const useLogoFontValue = (): LogoFont => useContext(LogoFontContext);

// Tooltip of each option: what it changes compared with the reference (Inter).
export const LOGO_FONT_HINTS: Record<LogoFont, string> = {
  inter: 'Reference. Inter Bold, centered by its text box: a narrow pair (BI) floats with wide margins while a wide one (RE, OR) nearly touches the edges.',
  optical:
    'Inter Bold, but each pair is measured on the real glyphs and shifted so the visible ink is centered horizontally and the capitals vertically. Same look as Inter, even margins.',
  mono: 'Monospace bold (Consolas or the system mono): every letter has the same width, so all pairs take the same space.',
  cells: 'Inter Bold with each letter centered in its own fixed-width cell: a regular rhythm, but narrow letters (I) get more air around them.',
  serif: 'Serif bold (Georgia or the system serif): a monogram look, with the same optical centering as Optical.',
};
