import React from 'react';
import { EyeOff, Plus } from 'lucide-react';
import { usePersistentSet } from './usePersistentSet.js';

// Floating A/B test bar, dev server only (App renders it under import.meta.env.DEV). One test = one row:
// [ LABEL (hide) | option option option ... ]. See the A/B testing rule in the project CLAUDE.md.
export const HIDDEN_TESTS_KEY = 'shell.abHidden';

export interface AbOption {
  id: string;
  label: string;
  // Tooltip: what this option changes compared with the reference one.
  title: string;
}

export interface AbTest {
  id: string;
  // Name of the test, shown on the left of its row.
  label: string;
  // Current choice, shown on the reminder chip when the row is hidden.
  summary: string;
  options: readonly AbOption[];
  value: string;
  onSelect: (id: string) => void;
}

// Beyond this many options a row wraps onto a second line instead of squeezing the labels.
const MAX_COLUMNS = 9;

// Every row has the same width and the same label column, so the labels line up.
function AbRow({ test, onHide }: { test: AbTest; onHide: () => void }): React.ReactElement {
  const cell = (id: string): string =>
    `rounded-full py-1 text-center font-semibold transition-colors ${id === test.value ? 'bg-primary-solid text-white' : 'text-muted hover:bg-bg hover:text-content'}`;
  const columns = Math.min(test.options.length, MAX_COLUMNS);
  return (
    <div className="flex w-[46rem] items-stretch overflow-hidden rounded-[1.25rem] border border-border bg-surface text-xs">
      <span className="flex w-40 shrink-0 items-center justify-between gap-1 border-r border-border bg-bg pl-4 pr-2 text-[10px] font-medium uppercase tracking-wider text-muted">
        <span className="truncate">{test.label}</span>
        <button
          type="button"
          onClick={onHide}
          aria-label={`Hide ${test.label}`}
          title={`Hide the "${test.label}" test. Its choice stays applied; a reminder chip lets you bring it back.`}
          className="shrink-0 rounded-full p-1 text-muted hover:bg-surface hover:text-content"
        >
          <EyeOff size={12} />
        </button>
      </span>
      <div
        role="group"
        aria-label={test.label}
        // Few options (Off / On) keep a normal cell width, left-aligned, instead of stretching over the whole row.
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, ${test.options.length <= 3 ? '6rem' : '1fr'}))` }}
        className="grid flex-1 gap-1 p-1"
      >
        {test.options.map((o) => (
          <button key={o.id} type="button" onClick={() => test.onSelect(o.id)} aria-pressed={o.id === test.value} title={o.title} className={cell(o.id)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// One opaque dock holds every row, so the page does not show through the gaps between them. It is anchored by its
// bottom: adding or hiding rows grows or shrinks it upwards. A hidden row keeps its choice and leaves a reminder chip.
export function AbDock({ tests }: { tests: readonly AbTest[] }): React.ReactElement {
  const [hidden, toggleHidden] = usePersistentSet(HIDDEN_TESTS_KEY);
  const shown = tests.filter((t) => !hidden.has(t.id));
  const reminders = tests.filter((t) => hidden.has(t.id));
  return (
    // z-[9999]: stays above every overlay, modal and sticky element of the page.
    <div className="fixed bottom-6 left-1/2 z-[9999] -translate-x-1/2">
      <div data-testid="ab-dock" className="flex flex-col gap-1.5 rounded-[1.75rem] border border-border bg-surface p-1.5 shadow-2xl">
        {reminders.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {reminders.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => toggleHidden(t.id)}
                aria-label={`Show ${t.label}`}
                title={`Show the "${t.label}" test. Current choice: ${t.summary} (it stays applied while hidden).`}
                className="flex items-center gap-1.5 rounded-full border border-border bg-surface py-1 pl-3 pr-2 text-xs text-muted hover:text-content"
              >
                <span>
                  {t.label}: <strong className="font-semibold text-content">{t.summary}</strong>
                </span>
                <Plus size={12} />
              </button>
            ))}
          </div>
        ) : null}
        {shown.map((t) => (
          <AbRow key={t.id} test={t} onHide={() => toggleHidden(t.id)} />
        ))}
      </div>
    </div>
  );
}
