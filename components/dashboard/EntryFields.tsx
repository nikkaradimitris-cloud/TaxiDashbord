'use client';

import { useState } from 'react';
import { Field, Notice, Select } from '@/components/ui';
import { GREEK_MONTHS, periodLabel, yearOptions } from '@/lib/period';
import type { Preferences } from '@/lib/storage';
import type { DriverRow } from '@/lib/types';

/**
 * Κοινή λογική των φορμών «Βάρδια» και «Έξοδο οχήματος»: σε ποιον μήνα/έτος
 * και για ποιον οδηγό/αυτοκίνητο γίνεται η καταχώρηση.
 *
 * Νέα καταχώρηση: ακολουθεί την περίοδο/οδηγό της προβολής.
 * Διόρθωση: κρατά τα στοιχεία της εγγραφής, χωρίς να αλλάζει την προβολή.
 */
export function useEntryTarget({
  isAdmin,
  drivers,
  prefs,
  driverFilter,
  onPrefsChange,
  editing,
}: {
  isAdmin: boolean;
  drivers: DriverRow[];
  prefs: Preferences;
  driverFilter: string;
  onPrefsChange: (changes: Partial<Omit<Preferences, 'today'>>) => void;
  editing: { driver_id: string; year: number; month: number } | null;
}) {
  const [localDriverId, setLocalDriverId] = useState(editing?.driver_id ?? '');
  const [localMonth, setLocalMonth] = useState(editing?.month ?? prefs.today.month);
  const [localYear, setLocalYear] = useState(editing?.year ?? prefs.today.year);

  const isEditing = editing !== null;
  const year = isEditing ? localYear : prefs.year;
  const month = isEditing || prefs.month === 'all' ? localMonth : prefs.month;
  const followsFilter = !isEditing && driverFilter !== 'all';
  const selectable = isAdmin
    ? drivers.filter((d) => d.active || d.id === (followsFilter ? driverFilter : localDriverId))
    : drivers;
  const driverId = !isAdmin
    ? (drivers[0]?.id ?? '')
    : followsFilter
      ? driverFilter
      : selectable.some((d) => d.id === localDriverId)
        ? localDriverId
        : (selectable.find((d) => d.active)?.id ?? '');
  const driver = drivers.find((d) => d.id === driverId) ?? null;

  return {
    isEditing,
    year,
    month,
    selectable,
    driverId,
    driver,
    /** Ο οδηγός (μη admin) είναι ανενεργός: δεν καταχωρεί. */
    inactiveSelf: !isAdmin && driver !== null && !driver.active,
    isCurrentPeriod: isEditing || (year === prefs.today.year && month === prefs.today.month),
    setMonth(value: number) {
      if (isEditing || prefs.month === 'all') setLocalMonth(value);
      else onPrefsChange({ month: value });
    },
    setYear(value: number) {
      if (isEditing) setLocalYear(value);
      else onPrefsChange({ year: value });
    },
    setDriver(id: string) {
      if (followsFilter) onPrefsChange({ driverFilter: id });
      else setLocalDriverId(id);
    },
  };
}

export type EntryTarget = ReturnType<typeof useEntryTarget>;

/** Μήνας / Έτος της καταχώρησης, με προειδοποίηση όταν δεν είναι ο τρέχων μήνας. */
export function PeriodFields({
  target,
  prefs,
  onPrefsChange,
}: {
  target: EntryTarget;
  prefs: Preferences;
  onPrefsChange: (changes: Partial<Omit<Preferences, 'today'>>) => void;
}) {
  return (
    <>
      <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-3">
        <Field label="Μήνας">
          <Select value={target.month} onChange={(e) => target.setMonth(Number(e.target.value))}>
            {GREEK_MONTHS.map((name, index) => (
              <option key={name} value={index + 1}>
                {name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Έτος">
          <Select value={target.year} onChange={(e) => target.setYear(Number(e.target.value))}>
            {yearOptions(prefs.today.year, [target.year]).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {!target.isCurrentPeriod && (
        <Notice tone="warning">
          Η καταχώρηση θα γίνει στον μήνα <b>{periodLabel(target.year, target.month)}</b>, όχι στον τρέχοντα.{' '}
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => onPrefsChange({ year: prefs.today.year, month: prefs.today.month })}
          >
            Τρέχων μήνας
          </button>
        </Notice>
      )}
    </>
  );
}

/** Οδηγός (βάρδια) ή αυτοκίνητο (έξοδο): επιλογή για τον admin, σταθερό για τον οδηγό. */
export function DriverField({
  target,
  isAdmin,
  driversLoaded,
  label,
  optionLabel,
}: {
  target: EntryTarget;
  isAdmin: boolean;
  driversLoaded: boolean;
  label: string;
  optionLabel: (driver: DriverRow) => string;
}) {
  const { selectable, driverId, driver } = target;
  return (
    <>
      <Field label={label}>
        {isAdmin ? (
          <Select value={driverId} onChange={(e) => target.setDriver(e.target.value)} disabled={selectable.length === 0}>
            {selectable.length === 0 && <option value="">— Δεν υπάρχουν οδηγοί —</option>}
            {selectable.map((d) => (
              <option key={d.id} value={d.id}>
                {optionLabel(d)}
              </option>
            ))}
          </Select>
        ) : (
          <div className="flex min-h-11 items-center rounded-xl border border-line bg-bg px-3 text-base">
            {driver ? optionLabel(driver) : '—'}
          </div>
        )}
      </Field>
      {isAdmin && driversLoaded && selectable.length === 0 && (
        <Notice tone="info">
          Προσθέστε πρώτα οδηγό (π.χ. τον εαυτό σας) στην{' '}
          <a href="#fleet" className="font-semibold underline">
            Υποδομή Στόλου
          </a>
          .
        </Notice>
      )}
      {target.inactiveSelf && (
        <Notice tone="error">Ο λογαριασμός οδηγού είναι ανενεργός. Επικοινωνήστε με τον ιδιοκτήτη.</Notice>
      )}
    </>
  );
}

/** «Γιώργος Παπαδόπουλος · ΤΑΕ-1234» */
export function driverOptionLabel(driver: DriverRow): string {
  return `${driver.name}${driver.plate ? ` · ${driver.plate}` : ''}`;
}

/** «ΤΑΕ-1234 · Γιώργος Παπαδόπουλος» (το αυτοκίνητο πρώτα). */
export function vehicleOptionLabel(driver: DriverRow): string {
  return driver.plate ? `${driver.plate} · ${driver.name}` : driver.name;
}

/** Διακόπτης «Βάρδια | Έξοδο οχήματος» πάνω στη φόρμα νέας καταχώρησης. */
export type EntryKind = 'shift' | 'expense';

export function EntryKindSwitch({ value, onChange }: { value: EntryKind; onChange: (kind: EntryKind) => void }) {
  const options: [EntryKind, string][] = [
    ['shift', 'Βάρδια'],
    ['expense', 'Έξοδο οχήματος'],
  ];
  return (
    <div role="group" aria-label="Τι καταχωρείτε" className="grid grid-cols-2 gap-1 rounded-xl bg-bg p-1">
      {options.map(([kind, label]) => (
        <button
          key={kind}
          type="button"
          aria-pressed={value === kind}
          onClick={() => onChange(kind)}
          className={
            'min-h-11 rounded-lg px-2 py-1 text-sm leading-tight transition-colors ' +
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong ' +
            (value === kind ? 'bg-accent font-semibold text-on-accent shadow-sm' : 'text-muted hover:bg-card hover:text-fg')
          }
        >
          {label}
        </button>
      ))}
    </div>
  );
}
