import React from 'react';
import { FieldText } from '@wadeck-app/dsl-ui';

export interface PinFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  // Read-only and aria-busy (not disabled) while the server is asked: the field keeps its place in the tab order and the focus.
  busy: boolean;
  description?: string;
  error?: string;
  // Kept for the callers: both values mean "no saved password" (see PinField).
  autoComplete?: 'off' | 'new-password';
  autoFocus?: boolean;
}

// A PIN field of the design system (FieldText): masked, read-only while busy, and never offered a saved password. Chrome ignores
// autocomplete="off" on a password field (a user saw the passphrase of another module offered in the PIN field), it respects
// "new-password": so every PIN field says that, whatever the caller asks. A name of its own keeps it out of any login group, and the
// data-* hints are the ones of 1Password, LastPass and Bitwarden for "not a login".
export function PinField({ label, value, onChange, busy, description, error, autoFocus }: PinFieldProps): React.ReactElement {
  const id = React.useId();
  return (
    <FieldText
      label={label}
      description={description}
      value={value}
      onChange={onChange}
      readOnly={busy}
      error={error}
      type="password"
      name={`app-core-pin-${id}`}
      autoComplete="new-password"
      autoFocus={autoFocus}
      aria-busy={busy}
      data-1p-ignore="true"
      data-lpignore="true"
      data-bwignore="true"
    />
  );
}

// What stops the primary button, said in its tooltip: nothing is "just dim". `undefined` when it can be used.
export function submitBlockedReason({ busy, locked, remaining, filled, fieldsHint }: { busy: boolean; locked: boolean; remaining: number; filled: boolean; fieldsHint: string }): string | undefined {
  if (busy) {
    return undefined;
  }
  if (locked) {
    return `Wait ${remaining} s`;
  }
  return filled ? undefined : fieldsHint;
}

// A button of a form whose actions sit outside of it (a dialog footer), or inside: it is never the one a browser presses on Enter
// (the ButtonAction of the design system has no `form` attribute), so the form carries this invisible submit button. It is out of the
// tab order and of the accessibility tree: the visible button does the work for a pointer, this one only catches the Enter key.
export function HiddenSubmit(): React.ReactElement {
  return <button type="submit" tabIndex={-1} aria-hidden="true" className="sr-only" data-testid="pin-hidden-submit" />;
}
