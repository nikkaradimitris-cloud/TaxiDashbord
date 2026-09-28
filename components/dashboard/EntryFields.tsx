'use client';

import { useState, type CSSProperties, type Ref } from 'react';
import { Chevron } from '@/components/Panel';
import { choiceStyles, cx, Field, Notice, Select } from '@/components/ui';
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
  autoFocus = false,
}: {
  target: EntryTarget;
  prefs: Preferences;
  onPrefsChange: (changes: Partial<Omit<Preferences, 'today'>>) => void;
  /** Ο κέρσορας στον μήνα μόλις εμφανιστούν τα πεδία (μετά το «Αλλαγή»). */
  autoFocus?: boolean;
}) {
  return (
    <>
      <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-3">
        <Field label="Μήνας">
          <Select value={target.month} onChange={(e) => target.setMonth(Number(e.target.value))} autoFocus={autoFocus}>
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
      <PeriodWarning target={target} prefs={prefs} onPrefsChange={onPrefsChange} />
    </>
  );
}

/** Προειδοποίηση όταν η καταχώρηση δεν πάει στον τρέχοντα μήνα (φαίνεται πάντα). */
function PeriodWarning({
  target,
  prefs,
  onPrefsChange,
}: {
  target: EntryTarget;
  prefs: Preferences;
  onPrefsChange: (changes: Partial<Omit<Preferences, 'today'>>) => void;
}) {
  if (target.isCurrentPeriod) return null;
  return (
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
      <InactiveNotice target={target} />
    </>
  );
}

function InactiveNotice({ target }: { target: EntryTarget }) {
  if (!target.inactiveSelf) return null;
  return <Notice tone="error">Ο λογαριασμός οδηγού είναι ανενεργός. Επικοινωνήστε με τον ιδιοκτήτη.</Notice>;
}

/**
 * Για ποιον μήνα και ποιο αυτοκίνητο γίνεται η καταχώρηση, σε μία γραμμή
 * («Για: Σεπτέμβριος 2026 · ΤΑΕ-1234 — Αλλαγή»), αφού συνήθως είναι ήδη
 * διαλεγμένα στα φίλτρα. Τα πεδία φαίνονται με «Αλλαγή», στη διόρθωση, όταν
 * στα φίλτρα είναι «Όλο το έτος» ή όταν δεν υπάρχει οδηγός.
 */
export function EntryTargetFields({
  target,
  prefs,
  onPrefsChange,
  isAdmin,
  driversLoaded,
  label,
  optionLabel,
}: {
  target: EntryTarget;
  prefs: Preferences;
  onPrefsChange: (changes: Partial<Omit<Preferences, 'today'>>) => void;
  isAdmin: boolean;
  driversLoaded: boolean;
  label: 'Οδηγός' | 'Αυτοκίνητο';
  optionLabel: (driver: DriverRow) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  if (expanded || target.isEditing || prefs.month === 'all' || !target.driver) {
    return (
      <>
        <PeriodFields target={target} prefs={prefs} onPrefsChange={onPrefsChange} autoFocus={expanded} />
        <DriverField target={target} isAdmin={isAdmin} driversLoaded={driversLoaded} label={label} optionLabel={optionLabel} />
      </>
    );
  }
  return (
    <>
      {/* Μήνας και «Αλλαγή» στην πρώτη γραμμή· το αυτοκίνητο από κάτω, σε όλο το πλάτος. */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 rounded-xl bg-bg px-3 py-1.5 text-sm">
        <p>
          Για: <b>{periodLabel(target.year, target.month)}</b>
        </p>
        <p className="col-span-2 pb-1">{optionLabel(target.driver)}</p>
        <button
          type="button"
          className={cx(
            'col-start-2 row-start-1 min-h-9 rounded font-semibold underline',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong',
          )}
          aria-label={isAdmin ? `Αλλαγή μήνα ή ${label === 'Οδηγός' ? 'οδηγού' : 'αυτοκινήτου'}` : 'Αλλαγή μήνα'}
          onClick={() => setExpanded(true)}
        >
          Αλλαγή
        </button>
      </div>
      <PeriodWarning target={target} prefs={prefs} onPrefsChange={onPrefsChange} />
      <InactiveNotice target={target} />
    </>
  );
}

/** Επιλογή με κουμπιά σε μία γραμμή (radio), π.χ. «Uber | FreeNow». */
export function SegmentedField<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
  error,
}: {
  legend: string;
  name: string;
  options: readonly { id: T; label: string }[];
  /** '' = δεν έχει διαλέξει ακόμη. */
  value: T | '';
  onChange: (value: T) => void;
  error?: string;
}) {
  return (
    <fieldset>
      <legend className="mb-1 block text-sm font-medium">{legend}</legend>
      <div
        className="grid gap-1 rounded-xl bg-bg p-1"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(min-content, 1fr))` } as CSSProperties}
      >
        {options.map((option) => (
          <label
            key={option.id}
            className={cx(
              'flex min-h-11 cursor-pointer items-center justify-center rounded-lg px-2 py-1 text-center text-sm leading-tight transition-colors',
              'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent-strong',
              value === option.id ? choiceStyles.on : choiceStyles.off,
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.id}
              checked={value === option.id}
              onChange={() => onChange(option.id)}
              className="sr-only"
            />
            {option.label}
          </label>
        ))}
      </div>
      {error && <span className="mt-1 block text-sm text-bad">{error}</span>}
    </fieldset>
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

/** Κλειστή φόρμα νέας καταχώρησης: ένα κουμπί που την ανοίγει. */
export function NewEntryButton({ onClick, ref }: { onClick: () => void; ref?: Ref<HTMLButtonElement> }) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-expanded={false}
      className={cx(
        'flex w-full items-center justify-between gap-3 rounded-2xl bg-accent px-4 py-3 text-left text-on-accent shadow-sm hover:bg-accent-strong',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong',
      )}
    >
      <span className="min-w-0">
        <span className="block text-lg font-bold">+ Νέα καταχώρηση</span>
        <span className="block text-sm text-on-accent/80">Βάρδια · Έξοδο οχήματος · Εφαρμογή</span>
      </span>
      <Chevron open={false} className="text-on-accent" />
    </button>
  );
}

/** Διακόπτης «Βάρδια | Έξοδο οχήματος | Εφαρμογή» πάνω στη φόρμα νέας καταχώρησης. */
export type EntryKind = 'shift' | 'expense' | 'platform';

export function EntryKindSwitch({ value, onChange }: { value: EntryKind; onChange: (kind: EntryKind) => void }) {
  const options: [EntryKind, string][] = [
    ['shift', 'Βάρδια'],
    ['expense', 'Έξοδο οχήματος'],
    ['platform', 'Εφαρμογή'],
  ];
  return (
    // minmax(min-content, 1fr): ίσα κουμπιά, αλλά μια μεγάλη λέξη («Εφαρμογή» με «Α+») δεν βγαίνει έξω.
    <div
      role="group"
      aria-label="Τι καταχωρείτε"
      className="grid grid-cols-[repeat(3,minmax(min-content,1fr))] gap-1 rounded-xl bg-bg p-1"
    >
      {options.map(([kind, label]) => (
        <button
          key={kind}
          type="button"
          aria-pressed={value === kind}
          onClick={() => onChange(kind)}
          className={cx(
            'min-h-11 rounded-lg px-2 py-1 text-sm leading-tight transition-colors',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong',
            value === kind ? choiceStyles.on : choiceStyles.off,
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
