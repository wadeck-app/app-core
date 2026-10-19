import React, { useRef } from 'react';
import { useOpticalCenter } from './opticalCenter.js';

// Letters fill the tile: large font, no vertical room, and a width that follows the text (min = square).
// The one size of a tile everywhere.
const SIZE = 'h-5 min-w-[20px] px-[3px] text-[11px]';

// A small rounded tile with 1 to 3 letters in white on `color` (an avatar / monogram). Decorative: hidden from assistive
// technology, so the name it stands for must be readable next to it.
export function InitialsTile({ text, color }: { text: string; color: string }): React.ReactElement {
  const inner = useRef<HTMLSpanElement>(null);
  // Optical centering: the text box is centered on its advance width, which leaves pairs like "BI" or "RE" visibly
  // off-center. The visible ink is measured and shifted instead (see opticalCenter.ts).
  useOpticalCenter(inner, text, true, []);
  return (
    <span
      aria-hidden="true"
      data-logo={text}
      style={{ backgroundColor: color }}
      className={`grid shrink-0 place-items-center overflow-hidden rounded-md font-bold leading-none tracking-tighter text-white ${SIZE}`}
    >
      <span ref={inner} className="inline-block whitespace-nowrap">
        {text}
      </span>
    </span>
  );
}
