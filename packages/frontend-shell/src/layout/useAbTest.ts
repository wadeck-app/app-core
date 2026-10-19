import type { AbTest } from './AbSwitcher.js';
import { usePersistentChoice } from './usePersistentChoice.js';

export interface AbOptionSpec {
  label: string;
  // Tooltip: what this option changes compared with the reference one.
  hint: string;
}

export interface AbTestSpec<T extends string> {
  // Short stable id: it names the storage key and the URL parameter (`ab.<id>`).
  id: string;
  // Name of the test, shown on the left of its row.
  label: string;
  // The options, in display order. The record key is the option id.
  options: Record<T, AbOptionSpec>;
  // The reference option, used until someone chooses.
  initial: T;
}

// Declares an A/B test in one place. Returns the test for `<AbDock tests={[...]} />` and, through `value`, the
// current choice to apply. The choice is stored in localStorage (`ab.<id>`), can be forced by a link
// (`?ab.<id>=<option>`) and follows changes made in other tabs.
export function useAbTest<T extends string>(spec: AbTestSpec<T>): AbTest & { value: T } {
  const ids = Object.keys(spec.options) as T[];
  const key = `ab.${spec.id}`;
  const [value, setValue] = usePersistentChoice<T>(key, ids, spec.initial, spec.label.toLowerCase(), key);
  return {
    id: spec.id,
    label: spec.label,
    summary: spec.options[value].label,
    options: ids.map((id) => ({ id, label: spec.options[id].label, title: spec.options[id].hint })),
    value,
    onSelect: (id) => setValue(id as T),
  };
}
