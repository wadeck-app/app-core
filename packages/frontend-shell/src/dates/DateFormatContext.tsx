import React, { createContext, useContext, useMemo } from 'react';
import { createDateFormatter, type DateFormatter } from './dateFormatter.js';
import { useDateSettings } from './dateSettings.js';

type SettingsControl = ReturnType<typeof useDateSettings>;

const FormatterContext = createContext<DateFormatter | null>(null);
const SettingsContext = createContext<SettingsControl | null>(null);

// Reads the date settings of the user once and gives the whole app the one formatter built from them. Mounted at the root
// of the shell: a change in the settings dialog re-renders every date at once.
export function DateFormatProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const control = useDateSettings();
  const { settings } = control;
  const formatter = useMemo(() => createDateFormatter(settings), [settings]);
  return (
    <SettingsContext.Provider value={control}>
      <FormatterContext.Provider value={formatter}>{children}</FormatterContext.Provider>
    </SettingsContext.Provider>
  );
}

// The formatter of the app. Throws outside the provider: a date shown without it would silently ignore the user's settings.
export function useDateFormat(): DateFormatter {
  const formatter = useContext(FormatterContext);
  if (formatter === null) {
    throw new Error('useDateFormat() needs <DateFormatProvider> above it (the shell mounts one at its root).');
  }
  return formatter;
}

// The settings and how to change them (the dialog that edits them uses this one).
export function useDateSettingsControl(): SettingsControl {
  const control = useContext(SettingsContext);
  if (control === null) {
    throw new Error('useDateSettingsControl() needs <DateFormatProvider> above it (the shell mounts one at its root).');
  }
  return control;
}
