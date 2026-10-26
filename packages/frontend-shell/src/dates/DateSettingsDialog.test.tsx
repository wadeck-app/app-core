import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useDateFormat } from '@wadeck-app/dsl-ui';
import { DateSettingsProvider } from './DateFormatContext.js';
import { DateSettingsButton } from './DateSettingsDialog.js';
import { DATE_SETTINGS_KEY } from './dateSettings.js';

// What a consumer of the formatter shows, to see the settings reach it.
function Sample(): React.ReactElement {
  const f = useDateFormat();
  return <p data-testid="sample">{f.format(Date.UTC(2026, 9, 24, 16, 38, 5), 'short')}</p>;
}

function renderDialog() {
  render(
    <DateSettingsProvider>
      <DateSettingsButton />
      <Sample />
    </DateSettingsProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Date and time settings' }));
  return within(screen.getByRole('dialog', { name: 'Date and time' }));
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('DateSettingsButton', () => {
  it('opens a dialog with English defaults and a preview', () => {
    const dialog = renderDialog();
    expect(dialog.getByLabelText('Language')).toHaveValue('en-GB');
    expect(dialog.getByLabelText('Time zone')).toHaveValue('local');
    expect(dialog.getByLabelText('Preview')).toHaveTextContent(/\d{2}\/\d{2}\/\d{4}/);
    expect(dialog.getByRole('button', { name: /Default settings/ })).toBeDisabled();
  });

  it('applies a change to every consumer at once and keeps it in this browser', () => {
    const dialog = renderDialog();
    fireEvent.change(dialog.getByLabelText('Time zone'), { target: { value: 'UTC' } });
    fireEvent.change(dialog.getByLabelText('Language'), { target: { value: 'en-US' } });
    expect(screen.getByTestId('sample')).toHaveTextContent('10/24/2026, 04:38 PM');
    expect(JSON.parse(window.localStorage.getItem(DATE_SETTINGS_KEY) ?? '{}')).toMatchObject({ locale: 'en-US', timeZone: 'UTC' });
  });

  it('greys the clock out for ISO 8601, which is always 24h', () => {
    const dialog = renderDialog();
    expect(dialog.getByLabelText('Clock')).toBeEnabled();
    fireEvent.change(dialog.getByLabelText('Format'), { target: { value: 'iso' } });
    expect(dialog.getByLabelText('Clock')).toBeDisabled();
  });

  it('goes back to the defaults, offered only once something changed', () => {
    const dialog = renderDialog();
    fireEvent.change(dialog.getByLabelText('Language'), { target: { value: 'fr-FR' } });
    const reset = dialog.getByRole('button', { name: /Default settings/ });
    expect(reset).toBeEnabled();
    fireEvent.click(reset);
    expect(dialog.getByLabelText('Language')).toHaveValue('en-GB');
  });
});

describe('without the provider', () => {
  it('shows dates with the documented default (English, 24h), not the language of the browser', () => {
    render(<Sample />);
    expect(screen.getByTestId('sample')).toHaveTextContent(/^\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}$/);
  });
});
