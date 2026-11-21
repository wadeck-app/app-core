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
  // 'new-password' on a PIN being chosen, so the browser neither offers a saved one nor paints an autofill fill; 'off' on the one being asked.
  autoComplete?: 'off' | 'new-password';
  autoFocus?: boolean;
}

// A PIN field of the design system (FieldText): masked, no browser autofill, read-only while busy.
export function PinField({ label, value, onChange, busy, description, error, autoComplete = 'off', autoFocus }: PinFieldProps): React.ReactElement {
  return <FieldText label={label} description={description} value={value} onChange={onChange} readOnly={busy} error={error} type="password" autoComplete={autoComplete} autoFocus={autoFocus} aria-busy={busy} />;
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
