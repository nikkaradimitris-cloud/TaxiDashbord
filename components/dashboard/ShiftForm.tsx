'use client';

import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Button, Card, Field, Input, Notice, Select } from '@/components/ui';
import { VAT_STATUS_LABEL, vatStatus } from '@/lib/accounting';
import { findShiftByZ, insertShift } from '@/lib/data';
import { dataErrorMessage, isNetworkError } from '@/lib/errors';
import { formatEuro, formatKm } from '@/lib/format';
import { GREEK_MONTHS, periodLabel, yearOptions } from '@/lib/period';
import { EMPTY_SHIFT_FORM, parseShiftForm, toShiftInsert, type ShiftFormValues } from '@/lib/shift-form';
import type { PendingShift, Preferences } from '@/lib/storage';
import type { BrowserSupabase } from '@/lib/supabase/client';
import type { DriverRow, ShiftRow } from '@/lib/types';
import { newId } from '@/lib/uuid';

type Message = { tone: 'success' | 'error' | 'warning'; text: string };

/** Επιτρέπει μόνο ψηφία, κόμμα και τελεία (αριθμητικά πεδία). */
function sanitizeNumber(value: string) {
  return value.replace(/[^\d.,]/g, '');
}

export function ShiftForm({
  supabase,
  isAdmin,
  drivers,
  driversLoaded,
  prefs,
  driverFilter,
  onPrefsChange,
  onSaved,
  onQueued,
}: {
  supabase: BrowserSupabase;
  isAdmin: boolean;
  drivers: DriverRow[];
  driversLoaded: boolean;
  prefs: Preferences;
  driverFilter: string;
  onPrefsChange: (changes: Partial<Omit<Preferences, 'today'>>) => void;
  onSaved: (row: ShiftRow) => void;
  onQueued: (item: PendingShift) => void;
}) {
  const [values, setValues] = useState<ShiftFormValues>(EMPTY_SHIFT_FORM);
  const [localDriverId, setLocalDriverId] = useState('');
  const [localMonth, setLocalMonth] = useState(prefs.today.month);
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const zInput = useRef<HTMLInputElement>(null);

  // Η φόρμα ακολουθεί την επιλεγμένη περίοδο/οδηγό της προβολής.
  const year = prefs.year;
  const month = prefs.month === 'all' ? localMonth : prefs.month;
  const selectable = isAdmin ? drivers.filter((d) => d.active || d.id === driverFilter) : drivers;
  const driverId = !isAdmin
    ? (drivers[0]?.id ?? '')
    : driverFilter !== 'all'
      ? driverFilter
      : selectable.some((d) => d.id === localDriverId)
        ? localDriverId
        : (selectable.find((d) => d.active)?.id ?? '');
  const driver = drivers.find((d) => d.id === driverId) ?? null;
  const inactiveSelf = !isAdmin && driver !== null && !driver.active;

  const parsed = parseShiftForm(values);
  const errors = showErrors ? parsed.errors : {};
  const preview = parsed.preview;
  const status = vatStatus(preview.vatBalanceCents);
  const isCurrentPeriod = year === prefs.today.year && month === prefs.today.month;

  const set = (key: keyof ShiftFormValues, numeric = true) => ({
    value: values[key],
    onChange: (e: { target: { value: string } }) => {
      setValues((prev) => ({ ...prev, [key]: numeric ? sanitizeNumber(e.target.value) : e.target.value }));
      if (message?.tone !== 'error') setMessage(null); // νέα καταχώρηση: κρύβεται το προηγούμενο μήνυμα
    },
    'aria-invalid': Boolean(errors[key]),
  });

  function setMonth(value: number) {
    if (prefs.month === 'all') setLocalMonth(value);
    else onPrefsChange({ month: value });
  }

  function setDriver(id: string) {
    if (driverFilter !== 'all') onPrefsChange({ driverFilter: id });
    else setLocalDriverId(id);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setShowErrors(true);
    setMessage(null);
    if (!parsed.input || !driver) return;

    const zNumber = values.zNumber.trim();
    const payload = toShiftInsert(parsed.input, { id: newId(), driverId: driver.id, year, month, zNumber });
    const label = `Ζ ${zNumber} · ${driver.name} · ${periodLabel(year, month)}`;
    setBusy(true);
    try {
      const duplicate = await findShiftByZ(supabase, driver.id, zNumber);
      if (
        duplicate &&
        !confirm(
          `Υπάρχει ήδη βάρδια με Ζ ${zNumber} για τον/την ${driver.name} (${periodLabel(duplicate.year, duplicate.month)}). Να καταχωρηθεί ξανά;`,
        )
      ) {
        return;
      }
      const row = await insertShift(supabase, payload);
      if (row) onSaved(row);
      setValues(EMPTY_SHIFT_FORM);
      setShowErrors(false);
      setMessage({ tone: 'success', text: `✓ Καταχωρήθηκε: ${label}` });
      zInput.current?.focus();
    } catch (error) {
      if (isNetworkError(error)) {
        onQueued({ payload, driverName: driver.name, savedAt: new Date().toISOString() });
        setValues(EMPTY_SHIFT_FORM);
        setShowErrors(false);
        setMessage({
          tone: 'warning',
          text: `Χωρίς σύνδεση: η βάρδια (${label}) κρατήθηκε στη συσκευή και θα σταλεί αυτόματα μόλις επανέλθει το internet.`,
        });
      } else {
        setMessage({ tone: 'error', text: dataErrorMessage(error) });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Καταχώρηση Βάρδιας" id="shift-form">
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Μήνας">
            <Select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {GREEK_MONTHS.map((name, index) => (
                <option key={name} value={index + 1}>
                  {name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Έτος">
            <Select value={year} onChange={(e) => onPrefsChange({ year: Number(e.target.value) })}>
              {yearOptions(prefs.today.year, [year]).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        {!isCurrentPeriod && (
          <Notice tone="warning">
            Η καταχώρηση θα γίνει στον μήνα <b>{periodLabel(year, month)}</b>, όχι στον τρέχοντα.{' '}
            <button
              type="button"
              className="font-semibold underline"
              onClick={() => onPrefsChange({ year: prefs.today.year, month: prefs.today.month })}
            >
              Τρέχων μήνας
            </button>
          </Notice>
        )}

        <Field label="Οδηγός">
          {isAdmin ? (
            <Select value={driverId} onChange={(e) => setDriver(e.target.value)} disabled={selectable.length === 0}>
              {selectable.length === 0 && <option value="">— Δεν υπάρχουν οδηγοί —</option>}
              {selectable.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                  {d.plate ? ` · ${d.plate}` : ''}
                </option>
              ))}
            </Select>
          ) : (
            <div className="flex min-h-11 items-center rounded-xl border border-line bg-bg px-3 text-base">
              {driver ? `${driver.name}${driver.plate ? ` · ${driver.plate}` : ''}` : '—'}
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
        {inactiveSelf && (
          <Notice tone="error">Ο λογαριασμός οδηγού είναι ανενεργός. Επικοινωνήστε με τον ιδιοκτήτη.</Notice>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Αριθμός Ζ *" error={errors.zNumber}>
            <Input ref={zInput} autoComplete="off" enterKeyHint="next" maxLength={40} {...set('zNumber', false)} />
          </Field>
          <Field label="Αρ. Διαδρομών" error={errors.trips}>
            <Input inputMode="numeric" autoComplete="off" placeholder="0" {...set('trips')} />
          </Field>
          <Field label="Μισθωμένα Χλμ" error={errors.paidKm}>
            <Input inputMode="decimal" autoComplete="off" placeholder="0,0" {...set('paidKm')} />
          </Field>
          <Field label="Ελεύθερα Χλμ" error={errors.emptyKm}>
            <Input inputMode="decimal" autoComplete="off" placeholder="0,0" {...set('emptyKm')} />
          </Field>
        </div>

        <Group title="Έσοδα">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Αποφορολογημένα Έσοδα (€)" error={errors.netRevenue}>
              <Input inputMode="decimal" autoComplete="off" placeholder="0,00" {...set('netRevenue')} />
            </Field>
            <Field label="ΦΠΑ 13% (αυτόματα)" hint="Καθαρά × 0,129933">
              <output className="flex min-h-11 items-center rounded-xl border border-dashed border-line bg-bg px-3 text-base font-semibold tabular-nums">
                {formatEuro(preview.vatCents)}
              </output>
            </Field>
            <Field
              label="Φιλοδωρήματα / Άλλα Έσοδα (€)"
              hint="Χωρίς ΦΠΑ — προστίθενται στη μικτή είσπραξη."
              error={errors.tips}
              className="col-span-2"
            >
              <Input inputMode="decimal" autoComplete="off" placeholder="0,00" {...set('tips')} />
            </Field>
          </div>
        </Group>

        <Group title="Έξοδα (τελικά ποσά με ΦΠΑ 24%)">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Καύσιμα (€)" error={errors.fuel}>
              <Input inputMode="decimal" autoComplete="off" placeholder="0,00" {...set('fuel')} />
            </Field>
            <Field label="Άλλες Δαπάνες (€)" error={errors.otherExpenses}>
              <Input inputMode="decimal" autoComplete="off" placeholder="0,00" {...set('otherExpenses')} />
            </Field>
            <Field label="Επισκευές / Συντήρηση (€)" error={errors.repairs} className="col-span-2 sm:col-span-1">
              <Input inputMode="decimal" autoComplete="off" placeholder="0,00" {...set('repairs')} />
            </Field>
          </div>
        </Group>

        <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 rounded-xl bg-bg p-3 text-sm tabular-nums">
          <dt className="text-muted">Μικτή είσπραξη</dt>
          <dd className="text-right">{formatEuro(preview.grossReceiptsCents)}</dd>
          <dt className="text-muted">Σύνολο εξόδων</dt>
          <dd className="text-right">{formatEuro(preview.totalExpensesCents)}</dd>
          <dt className="text-muted">ΦΠΑ εξόδων 24% (συμψηφίζεται)</dt>
          <dd className="text-right">{formatEuro(preview.expensesVatCents)}</dd>
          <dt className="text-muted">Υπόλοιπο ΦΠΑ βάρδιας</dt>
          <dd className="text-right">
            {formatEuro(Math.abs(preview.vatBalanceCents))} {status !== 'zero' && `(${VAT_STATUS_LABEL[status]})`}
          </dd>
          <dt className="text-muted">Συνολικά χλμ</dt>
          <dd className="text-right">{formatKm(preview.totalKm)}</dd>
          <dt className="font-semibold">Καθαρό ταμείο</dt>
          <dd className="text-right font-semibold">{formatEuro(preview.netCashCents)}</dd>
        </dl>

        {message && <Notice tone={message.tone}>{message.text}</Notice>}

        <Button type="submit" variant="primary" className="w-full text-base" disabled={busy || !driver || inactiveSelf}>
          {busy ? 'Αποθήκευση…' : `Καταχώρηση · ${periodLabel(year, month)}`}
        </Button>
      </form>
    </Card>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="rounded-xl border border-line p-3">
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      {children}
    </fieldset>
  );
}
