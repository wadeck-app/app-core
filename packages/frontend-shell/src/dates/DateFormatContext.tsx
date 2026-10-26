import React, { createContext, useContext, useMemo } from 'react';
import { DateFormatProvider, createDateFormatter } from '@wadeck-app/dsl-ui';
import { useDateSettings } from './dateSettings.js';

type SettingsControl = ReturnType<typeof useDateSettings>;

const SettingsContext = createContext<SettingsControl | null>(null);

// Reads the date settings of the user once and gives the whole app (and the module bundles, which share dsl-ui) the one
// formatter built from them. Mounted at the root of the shell: a change in the settings dialog re-renders every date at once.
export function DateSettingsProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const control = useDateSettings();
  const { settings } = control;
  const formatter = useMemo(() => createDateFormatter(settings), [settings]);
  return (
    <SettingsContext.Provider value={control}>
      <DateFormatProvider formatter={formatter}>{children}</DateFormatProvider>
    </SettingsContext.Provider>
  );
}

// The settings and how to change them (the dialog that edits them uses this one).
export function useDateSettingsControl(): SettingsControl {
  const control = useContext(SettingsContext);
  if (control === null) {
    throw new Error('useDateSettingsControl() needs <DateSettingsProvider> above it (the shell mounts one at its root).');
  }
  return control;
}
