import React, { useMemo, useState } from 'react';
import { CalendarClock, Undo2 } from 'lucide-react';
import { Dialog, IconButton } from '@wadeck-app/dsl-ui';
import { createDateFormatter } from './dateFormatter.js';
import { useDateSettingsControl } from './DateFormatContext.js';
import { AUTO_LOCALE, DEFAULT_DATE_SETTINGS, LOCAL_TIME_ZONE, type DateSettings } from './dateSettings.js';

const SELECT = 'rounded border border-border bg-surface px-1.5 py-1 text-xs text-content focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50';
const LABEL = 'flex items-center justify-between gap-3 text-sm text-content';

// Each language is named in itself, so it can be found whatever the current one is.
const LOCALES: Array<[string, string]> = [
  ['en-GB', 'English (UK): 24/10/2026, 24h'],
  ['en-US', 'English (US): 10/24/2026, 12h'],
  ['fr-FR', 'Français (France)'],
  ['de-DE', 'Deutsch (Deutschland)'],
  ['es-ES', 'Español (España)'],
  ['it-IT', 'Italiano (Italia)'],
  ['nl-NL', 'Nederlands (Nederland)'],
  ['pt-PT', 'Português (Portugal)'],
  [AUTO_LOCALE, 'The language of the browser'],
];

// Whatever the browser knows, plus the two shortcuts; a stored value that is in none of them stays selectable.
function timeZoneOptions(current: string): Array<[string, string]> {
  const computer = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const named = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  const shortcuts: Array<[string, string]> = [
    [LOCAL_TIME_ZONE, `This computer (${computer})`],
    ['UTC', 'UTC'],
  ];
  const known = new Set([LOCAL_TIME_ZONE, 'UTC', ...named]);
  return [...shortcuts, ...(known.has(current) ? [] : ([[current, current]] as Array<[string, string]>)), ...named.filter((z) => z !== 'UTC').map((z): [string, string] => [z, z])];
}

function Choice<K extends keyof DateSettings>({ label, field, options, disabled = false }: { label: string; field: K; options: Array<[DateSettings[K], string]>; disabled?: boolean }): React.ReactElement {
  const { settings, update } = useDateSettingsControl();
  return (
    <label className={LABEL}>
      {label}
      <select className={SELECT} value={settings[field]} disabled={disabled} onChange={(e) => update({ [field]: e.target.value } as Partial<DateSettings>)}>
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

// What the settings do, shown on the current moment and on one a few minutes ago, with the formatter they build.
function Preview({ settings }: { settings: DateSettings }): React.ReactElement {
  const formatter = useMemo(() => createDateFormatter(settings), [settings]);
  const now = Date.now();
  const ago = now - 5 * 60_000;
  const rows: Array<[string, string]> = [
    ['Short', formatter.format(now, 'short')],
    ['Medium', formatter.format(now, 'medium')],
    ['Long', formatter.format(now, 'long')],
    ['Date only', formatter.format(now, 'medium', 'date')],
    ['Time only', formatter.format(now, 'medium', 'time')],
    ['Relative', formatter.relative(ago, now)],
    ['Exact (tooltip)', formatter.exact(now)],
    ['Week', formatter.weekdays().join(' ')],
  ];
  return (
    <dl aria-label="Preview" className="mt-3 grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1 rounded border border-border bg-bg p-3 text-xs">
      {rows.map(([name, text]) => (
        <React.Fragment key={name}>
          <dt className="text-muted">{name}</dt>
          <dd className="font-mono text-content">{text}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

// The date and time settings of the user: one dialog, opened from the top bar, applied everywhere at once and kept in this browser.
export function DateSettingsButton(): React.ReactElement {
  const [open, setOpen] = useState(false);
  const { settings, reset, customized } = useDateSettingsControl();
  return (
    <>
      <IconButton icon={<CalendarClock size={14} />} aria-label="Date and time settings" title="Date and time settings" variant="ghost" size="icon-sm" onClick={() => setOpen(true)} />
      <Dialog title="Date and time" open={open} onOpenChange={setOpen} size="md">
        <p className="mb-3 text-sm text-muted">How every date of the app is shown, in the tables, widgets, charts and logs. It is saved in this browser.</p>
        <div className="space-y-2">
          <Choice label="Language" field="locale" options={settings.locale !== AUTO_LOCALE && !LOCALES.some(([v]) => v === settings.locale) ? [[settings.locale, settings.locale], ...LOCALES] : LOCALES} />
          <Choice
            label="Format"
            field="preset"
            options={[
              ['locale', 'The conventions of the language'],
              ['iso', 'ISO 8601: 2026-10-24 18:38'],
            ]}
          />
          <Choice
            label="Clock"
            field="hourCycle"
            disabled={settings.preset === 'iso'}
            options={[
              ['auto', 'As the language does'],
              ['24h', '24 hours'],
              ['12h', '12 hours (AM/PM)'],
            ]}
          />
          <Choice label="Time zone" field="timeZone" options={timeZoneOptions(settings.timeZone)} />
          <Choice
            label="First day of the week"
            field="weekStart"
            options={[
              ['auto', 'As the language does'],
              ['monday', 'Monday'],
              ['sunday', 'Sunday'],
              ['saturday', 'Saturday'],
            ]}
          />
          <Choice
            label="Weekday names"
            field="weekdayStyle"
            options={[
              ['narrow', 'Initial (M T W)'],
              ['short', 'Short (Mon Tue Wed)'],
              ['long', 'Full (Monday)'],
            ]}
          />
        </div>
        <Preview settings={settings} />
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            disabled={!customized}
            onClick={reset}
            className="inline-flex items-center gap-1.5 rounded border border-border bg-surface px-2 py-1 text-xs text-content transition-colors hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
            Default settings ({DEFAULT_DATE_SETTINGS.locale}, local time)
          </button>
        </div>
      </Dialog>
    </>
  );
}
