import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PinField } from './PinField.js';

// The browser's password manager must not offer a saved password (the passphrase of another module, a site password) in a PIN field, and
// the field must not look like a login field to it: Chrome ignores autocomplete="off" on a password field, "new-password" it respects.
describe('PinField and the browser password manager', () => {
  it('asks for no saved password, even for the PIN being asked, and names itself apart from any login field', () => {
    render(<PinField label="PIN" value="" onChange={() => undefined} busy={false} />);
    const input = screen.getByLabelText('PIN');
    expect(input).toHaveAttribute('type', 'password');
    expect(input).toHaveAttribute('autocomplete', 'new-password');
    expect(input.getAttribute('name')).toMatch(/^app-core-pin/);
    for (const hint of ['data-1p-ignore', 'data-lpignore', 'data-bwignore']) {
      expect(input).toHaveAttribute(hint);
    }
  });

  it('keeps one name per field so the three fields of the change form are not one group', () => {
    render(
      <>
        <PinField label="Current PIN" value="" onChange={() => undefined} busy={false} />
        <PinField label="New PIN" value="" onChange={() => undefined} busy={false} />
      </>,
    );
    const names = [screen.getByLabelText('Current PIN'), screen.getByLabelText('New PIN')].map((el) => el.getAttribute('name'));
    expect(new Set(names).size).toBe(2);
  });
});
