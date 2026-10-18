import React from 'react';
import { Link } from 'react-router-dom';
import { EyeOff, Plus } from 'lucide-react';
import { LOGO_FONT_HINTS, LOGO_FONTS, type LogoFont } from './logoFont.js';
import { TAB_HIGHLIGHT_HINTS, TAB_HIGHLIGHTS, type TabHighlight } from './tabHighlight.js';
import { usePersistentChoice } from './usePersistentChoice.js';
import { usePersistentSet } from './usePersistentSet.js';

// A/B test of the shell navigation, dev server only (App renders it under import.meta.env.DEV).
export const LAYOUT_VARIANTS = {
  classic: 'Classic - current flat top bar',
  a: 'A - top tabs + fixed sidebar',
  b: 'B - Linear-like sidebar tree',
  c: 'C - top tabs + collapsible rail',
  // Short on purpose: the description floats outside the fixed-width panel and must fit the viewport.
  d: 'D - sidebar always visible',
  d1: 'D1 - dense, accent bar',
  d2: 'D2 - pills + 1-letter logo',
  d3: 'D3 - dark + 1-letter logo',
  d4: 'D4 - pills + 2-letter logo',
  d5: 'D5 - dark + 2-letter logo',
  d6: 'D6 - pills + colored logos',
  d7: 'D7 - dark + colored logos',
} as const;
export type LayoutVariant = keyof typeof LAYOUT_VARIANTS;

// Tooltip of each layout: what it does and how it differs from the previous one.
export const LAYOUT_VARIANT_HINTS: Record<LayoutVariant, string> = {
  classic: 'Current navigation: one flat top bar listing every page of every module.',
  a: 'Top bar with module names only; left sidebar with the pages of the active module. No sidebar for a single-page module nor on the dashboard.',
  b: 'Linear-like: everything on the left, one collapsible section per module; slim top bar with a breadcrumb.',
  c: 'Like A, plus a button that shrinks the sidebar to an icon rail (remembered).',
  d: 'Like A, but the sidebar is always visible, even for a single-page module; on the dashboard it lists the modules.',
  d1: 'D with a dense sidebar: small text and a thin accent bar on the active entry.',
  d2: 'D with a roomy sidebar: module logo (1 letter) in the header, the active entry filled with the accent color.',
  d3: 'Like D2, with an always-dark sidebar.',
  d4: 'D2 with a 2-letter logo (QU, OR, AL).',
  d5: 'D3 with a 2-letter logo.',
  d6: 'D4 plus one color per module: logos also in the top tabs and in front of the dashboard shortcuts.',
  d7: 'Like D6, with the dark sidebar.',
};

export const LAYOUT_VARIANT_KEY = 'shell.layout';
export const HIDDEN_TESTS_KEY = 'shell.abHidden';

export const useLayoutVariant = (): [LayoutVariant, (v: LayoutVariant) => void] =>
  usePersistentChoice(LAYOUT_VARIANT_KEY, Object.keys(LAYOUT_VARIANTS) as LayoutVariant[], 'classic', 'layout');

interface RowOption {
  id: string;
  label: string;
  title?: string;
}

interface SwitcherRowProps {
  // Name of the test, always shown on the left, muted and set apart from the options.
  label: string;
  options: readonly RowOption[];
  value: string;
  onSelect?: (id: string) => void;
  // With `hrefFor`, the options are links (route-based switch) instead of buttons.
  hrefFor?: (id: string) => string;
  // Adds a hide button to the label column; the test keeps its choice while hidden.
  onHide?: () => void;
}

// One A/B test = one row: [ LABEL (hide) | option option option ... ]. Every row has the same width and the same label column.
function SwitcherRow({ label, options, value, onSelect, hrefFor, onHide }: SwitcherRowProps): React.ReactElement {
  const cell = (id: string): string =>
    `rounded-full py-1 text-center font-semibold transition-colors ${id === value ? 'bg-primary-solid text-white' : 'text-muted hover:bg-bg hover:text-content'}`;
  return (
    <div className="flex w-[46rem] items-stretch overflow-hidden rounded-full border border-border bg-surface text-xs">
      <span className="flex w-40 shrink-0 items-center justify-between gap-1 border-r border-border bg-bg pl-4 pr-2 text-[10px] font-medium uppercase tracking-wider text-muted">
        <span className="truncate">{label}</span>
        {onHide ? (
          <button
            type="button"
            onClick={onHide}
            aria-label={`Hide ${label}`}
            title={`Hide the "${label}" test. Its choice stays applied; a reminder chip lets you bring it back.`}
            className="shrink-0 rounded-full p-1 text-muted hover:bg-surface hover:text-content"
          >
            <EyeOff size={12} />
          </button>
        ) : null}
      </span>
      <div
        role={hrefFor ? 'navigation' : 'group'}
        aria-label={label}
        // Few options (Off / On) keep a normal cell width, left-aligned, instead of stretching over the whole row.
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, ${options.length <= 3 ? '6rem' : '1fr'}))` }}
        className="grid flex-1 gap-1 p-1"
      >
        {options.map((o) =>
          hrefFor ? (
            <Link key={o.id} to={hrefFor(o.id)} aria-current={o.id === value ? 'true' : undefined} title={o.title} className={cell(o.id)}>
              {o.label}
            </Link>
          ) : (
            <button key={o.id} type="button" onClick={() => onSelect?.(o.id)} aria-pressed={o.id === value} title={o.title} className={cell(o.id)}>
              {o.label}
            </button>
          ),
        )}
      </div>
    </div>
  );
}

interface ExtraTest {
  id: string;
  label: string;
  // Current choice, shown on the reminder chip when the row is hidden.
  summary: string;
  options: RowOption[];
  value: string;
  onSelect: (id: string) => void;
}

interface LayoutSwitcherProps {
  variant: LayoutVariant;
  // Buttons by default (state switch); with `hrefFor`, links (route-based switch, dev comparison page).
  onChange?: (v: LayoutVariant) => void;
  hrefFor?: (v: LayoutVariant) => string;
  variants?: readonly LayoutVariant[];
  // Extra A/B tests stacked above the layout row, each omitted = no row. They can be hidden; the layout row cannot.
  accent?: { on: boolean; onToggle: () => void };
  tabStyle?: { value: TabHighlight; onChange: (h: TabHighlight) => void };
  logoFont?: { value: LogoFont; onChange: (f: LogoFont) => void };
}

const labelOf = (v: LayoutVariant): string => (v === 'classic' ? 'Classic' : v.toUpperCase());

// Floating on purpose: switching variants must be one obvious click, on the real page.
// The layout row is the fixed anchor (position and width never depend on the active variant); the other tests stack above it
// with the same width, and the description sits outside, stuck to its right edge and free to grow to the right.
export function LayoutSwitcher({ variant, onChange, hrefFor, variants = Object.keys(LAYOUT_VARIANTS) as LayoutVariant[], accent, tabStyle, logoFont }: LayoutSwitcherProps): React.ReactElement {
  const [hidden, toggleHidden] = usePersistentSet(HIDDEN_TESTS_KEY);

  const extras: ExtraTest[] = [];
  if (logoFont) {
    extras.push({
      id: 'logoFont',
      label: 'Logo font',
      summary: LOGO_FONTS[logoFont.value],
      options: (Object.keys(LOGO_FONTS) as LogoFont[]).map((f) => ({ id: f, label: LOGO_FONTS[f], title: LOGO_FONT_HINTS[f] })),
      value: logoFont.value,
      onSelect: (id) => logoFont.onChange(id as LogoFont),
    });
  }
  if (tabStyle) {
    extras.push({
      id: 'tabStyle',
      label: 'Active tab',
      summary: TAB_HIGHLIGHTS[tabStyle.value],
      options: (Object.keys(TAB_HIGHLIGHTS) as TabHighlight[]).map((h) => ({ id: h, label: TAB_HIGHLIGHTS[h], title: TAB_HIGHLIGHT_HINTS[h] })),
      value: tabStyle.value,
      onSelect: (id) => tabStyle.onChange(id as TabHighlight),
    });
  }
  if (accent) {
    extras.push({
      id: 'accent',
      label: 'Module accent',
      summary: accent.on ? 'On' : 'Off',
      options: [
        { id: 'off', label: 'Off', title: "Keep dsl-ui's default blue accent on every page." },
        { id: 'on', label: 'On', title: "Recolor the accent (primary) with the active module's color; backgrounds and text are untouched." },
      ],
      value: accent.on ? 'on' : 'off',
      onSelect: (id) => {
        if ((id === 'on') !== accent.on) accent.onToggle();
      },
    });
  }
  const shown = extras.filter((e) => !hidden.has(e.id));
  const reminders = extras.filter((e) => hidden.has(e.id));

  return (
    // z-[9999]: stays above every overlay, modal and sticky element of the page.
    // One opaque-ish dock holds every row, so the page does not show through the gaps between them. It is anchored by its
    // bottom: adding or hiding rows grows or shrinks it upwards and the layout row never moves.
    <div className="fixed bottom-6 left-1/2 z-[9999] -translate-x-1/2">
      <div data-testid="ab-dock" className="flex flex-col gap-1.5 rounded-[1.75rem] border border-border bg-surface p-1.5 shadow-2xl">
        {reminders.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {reminders.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => toggleHidden(e.id)}
                aria-label={`Show ${e.label}`}
                title={`Show the "${e.label}" test. Current choice: ${e.summary} (it stays applied while hidden).`}
                className="flex items-center gap-1.5 rounded-full border border-border bg-surface py-1 pl-3 pr-2 text-xs text-muted shadow-xl hover:text-content"
              >
                <span>
                  {e.label}: <strong className="font-semibold text-content">{e.summary}</strong>
                </span>
                <Plus size={12} />
              </button>
            ))}
          </div>
        ) : null}
        {shown.map((e) => (
          <SwitcherRow key={e.id} label={e.label} options={e.options} value={e.value} onSelect={e.onSelect} onHide={() => toggleHidden(e.id)} />
        ))}
        <div className="relative">
          <SwitcherRow
            label="Layout"
            options={variants.map((v) => ({ id: v, label: labelOf(v), title: `${LAYOUT_VARIANTS[v]}. ${LAYOUT_VARIANT_HINTS[v]}` }))}
            value={variant}
            onSelect={(id) => onChange?.(id as LayoutVariant)}
            hrefFor={hrefFor ? (id) => hrefFor(id as LayoutVariant) : undefined}
          />
          {/* Outside the dock, stuck to the layout row's right edge and free to grow to the right. */}
          <span
            data-testid="layout-description"
            className="absolute left-full top-1/2 ml-4 -translate-y-1/2 whitespace-nowrap rounded-full border border-border bg-surface px-3 py-1.5 text-xs text-muted shadow-xl"
          >
            {LAYOUT_VARIANTS[variant]}
          </span>
        </div>
      </div>
    </div>
  );
}
