'use client';

import { Button, Field, Select } from '@/components/ui';
import { GREEK_MONTHS, yearOptions, type MonthFilter } from '@/lib/period';
import type { Preferences } from '@/lib/storage';
import type { DriverRow } from '@/lib/types';

/** Επιλογή περιόδου (Έτος/Μήνας), φίλτρο οδηγού και εξαγωγή σε Excel. */
export function PeriodBar({
  prefs,
  isAdmin,
  drivers,
  driverFilter,
  onChange,
  onExport,
  canExport,
}: {
  prefs: Preferences;
  isAdmin: boolean;
  drivers: DriverRow[];
  driverFilter: string;
  onChange: (changes: Partial<Omit<Preferences, 'today'>>) => void;
  onExport: () => void;
  canExport: boolean;
}) {
  const years = yearOptions(prefs.today.year, [prefs.year]);

  return (
    <section id="filters" className="rounded-2xl border border-line bg-card p-3 shadow-sm sm:p-4">
      <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end">
        <Field label="Έτος" className="sm:w-32">
          <Select value={prefs.year} onChange={(e) => onChange({ year: Number(e.target.value) })}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Μήνας" className="sm:w-48">
          <Select
            value={prefs.month}
            onChange={(e) => {
              const value = e.target.value;
              onChange({ month: (value === 'all' ? 'all' : Number(value)) as MonthFilter });
            }}
          >
            <option value="all">Όλοι οι μήνες</option>
            {GREEK_MONTHS.map((name, index) => (
              <option key={name} value={index + 1}>
                {name}
              </option>
            ))}
          </Select>
        </Field>
        {isAdmin && (
          <Field label="Οδηγός" className="col-span-2 sm:w-56">
            <Select value={driverFilter} onChange={(e) => onChange({ driverFilter: e.target.value })}>
              <option value="all">Όλοι οι οδηγοί</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                  {d.plate ? ` · ${d.plate}` : ''}
                  {d.active ? '' : ' (ανενεργός)'}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Button onClick={onExport} disabled={!canExport} className="col-span-2 sm:ml-auto">
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
            <path d="M10 2a1 1 0 0 1 1 1v7.59l2.3-2.3a1 1 0 1 1 1.4 1.42l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.42L9 10.6V3a1 1 0 0 1 1-1zM4 15a1 1 0 0 1 1 1v1h10v-1a1 1 0 1 1 2 0v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1z" />
          </svg>
          Εξαγωγή Excel (CSV)
        </Button>
      </div>
    </section>
  );
}
