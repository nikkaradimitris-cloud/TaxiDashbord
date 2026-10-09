'use client';

import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { CollapseButton } from '@/components/Panel';
import { Button, Card, cx, Field, Input, Notice } from '@/components/ui';
import { VAT_STATUS_LABEL, vatStatus } from '@/lib/accounting';
import { findShiftByZ, insertShift, updateShift } from '@/lib/data';
import { dataErrorMessage, isNetworkError } from '@/lib/errors';
import { formatEuro, formatKm } from '@/lib/format';
import { periodLabel } from '@/lib/period';
import {
  EMPTY_SHIFT_FORM,
  parseShiftForm,
  shiftToFormValues,
  toShiftInsert,
  toShiftValues,
  type ShiftFormValues,
} from '@/lib/shift-form';
import type { PendingShift, Preferences } from '@/lib/storage';
import type { BrowserSupabase } from '@/lib/supabase/client';
import type { DriverRow, ShiftRow } from '@/lib/types';
import { newId } from '@/lib/uuid';
import { driverOptionLabel, EntryTargetFields, useEntryTarget } from './EntryFields';

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
  editing,
  onUpdated,
  onCancelEdit,
  switcher,
  onCollapse,
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
  /** Βάρδια προς διόρθωση (null = νέα καταχώρηση). Όταν αλλάζει, το component ξαναστήνεται (key). */
  editing: ShiftRow | null;
  onUpdated: (row: ShiftRow) => void;
  onCancelEdit: () => void;
  /** Διακόπτης «Βάρδια | Έξοδο οχήματος» (μόνο στη νέα καταχώρηση). */
  switcher?: ReactNode;
  /** «Κλείσιμο» της φόρμας νέας καταχώρησης (η φόρμα μένει φορτωμένη, απλώς κρύβεται). */
  onCollapse?: () => void;
}) {
  const [values, setValues] = useState<ShiftFormValues>(() => (editing ? shiftToFormValues(editing) : EMPTY_SHIFT_FORM));
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const zInput = useRef<HTMLInputElement>(null);

  const target = useEntryTarget({ isAdmin, drivers, prefs, driverFilter, onPrefsChange, editing });
  const { isEditing, year, month, driver, inactiveSelf } = target;

  const parsed = parseShiftForm(values);
  const errors = showErrors ? parsed.errors : {};
  const preview = parsed.preview;
  const status = vatStatus(preview.vatBalanceCents);

  const set = (key: keyof ShiftFormValues, numeric = true) => ({
    value: values[key],
    onChange: (e: { target: { value: string } }) => {
      setValues((prev) => ({ ...prev, [key]: numeric ? sanitizeNumber(e.target.value) : e.target.value }));
      if (message?.tone !== 'error') setMessage(null); // νέα καταχώρηση: κρύβεται το προηγούμενο μήνυμα
    },
    'aria-invalid': Boolean(errors[key]),
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setShowErrors(true);
    setMessage(null);
    if (!parsed.input || !driver) return;

    const zNumber = values.zNumber.trim();
    const meta = { driverId: driver.id, year, month, zNumber };
    const payload = editing ? null : toShiftInsert(parsed.input, { id: newId(), ...meta });
    const label = `Ζ ${zNumber} · ${driver.name} · ${periodLabel(year, month)}`;
    setBusy(true);
    try {
      if (!editing || zNumber !== editing.z_number || driver.id !== editing.driver_id) {
        const duplicate = await findShiftByZ(supabase, driver.id, zNumber, editing?.id);
        if (
          duplicate &&
          !confirm(
            `Υπάρχει ήδη βάρδια με Ζ ${zNumber} για τον/την ${driver.name} (${periodLabel(duplicate.year, duplicate.month)}). Να αποθηκευτεί παρ' όλα αυτά;`,
          )
        ) {
          return;
        }
      }
      if (editing) {
        const row = await updateShift(supabase, editing.id, toShiftValues(parsed.input, meta));
        if (!row) {
          setMessage({
            tone: 'error',
            text: 'Η διόρθωση δεν επιτρέπεται. Οι οδηγοί διορθώνουν μόνο δικές τους καταχωρήσεις μέσα σε 24 ώρες.',
          });
          return;
        }
        onUpdated(row);
        return;
      }
      const row = await insertShift(supabase, payload!);
      if (row) onSaved(row);
      setValues(EMPTY_SHIFT_FORM);
      setShowErrors(false);
      setMessage({ tone: 'success', text: `✓ Καταχωρήθηκε: ${label}` });
      zInput.current?.focus();
    } catch (error) {
      if (payload && isNetworkError(error)) {
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
    <Card
      title={editing ? `Επεξεργασία Βάρδιας · Ζ ${editing.z_number}` : 'Καταχώρηση Βάρδιας'}
      id={isEditing ? 'shift-edit-form' : 'shift-form'}
      className={cx(isEditing && 'ring-2 ring-accent-strong')}
      actions={onCollapse && !isEditing ? <CollapseButton onClick={onCollapse} label="Κλείσιμο φόρμας" /> : undefined}
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {switcher}
        <EntryTargetFields
          target={target}
          prefs={prefs}
          onPrefsChange={onPrefsChange}
          isAdmin={isAdmin}
          driversLoaded={driversLoaded}
          label="Οδηγός"
          optionLabel={driverOptionLabel}
        />

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
            {/* <wbr>: η μεγάλη λέξη σπάει σε στενές οθόνες αντί να πέφτει πάνω στο διπλανό πεδίο. */}
            <Field
              label={
                <>
                  Αποφορολογη<wbr />
                  μένα Έσοδα (€)
                </>
              }
              error={errors.netRevenue}
            >
              <Input inputMode="decimal" autoComplete="off" placeholder="0,00" {...set('netRevenue')} />
            </Field>
            <Field label="ΦΠΑ 13% (αυτόματα)" hint="Καθαρά × 0,129933">
              <output className="flex min-h-11 items-center rounded-xl border border-dashed border-line bg-bg px-3 text-base font-semibold tabular-nums">
                {formatEuro(preview.vatCents)}
              </output>
            </Field>
            <Field
              label="Φιλοδωρήματα / Άλλα Έσοδα (€)"
              hint="Χωρίς ΦΠΑ — προστίθενται στο ταμείο."
              error={errors.tips}
              className="col-span-2"
            >
              <Input inputMode="decimal" autoComplete="off" placeholder="0,00" {...set('tips')} />
            </Field>
          </div>
        </Group>

        <Group title="Έξοδα βάρδιας">
          <Field
            label="Καύσιμα (€)"
            hint="Τελικό ποσό με ΦΠΑ 24%. Επισκευές / συντήρηση και άλλα έξοδα του αυτοκινήτου καταχωρούνται ως «Έξοδο οχήματος»."
            error={errors.fuel}
          >
            <Input inputMode="decimal" autoComplete="off" placeholder="0,00" {...set('fuel')} />
          </Field>
        </Group>

        <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 rounded-xl bg-bg p-3 text-sm tabular-nums">
          <dt className="text-muted">Ταμείο (με ΦΠΑ)</dt>
          <dd className="text-right">{formatEuro(preview.grossReceiptsCents)}</dd>
          <dt className="text-muted">Καύσιμα</dt>
          <dd className="text-right">{formatEuro(preview.totalExpensesCents)}</dd>
          <dt className="text-muted">ΦΠΑ καυσίμων 24% (συμψηφίζεται)</dt>
          <dd className="text-right">{formatEuro(preview.expensesVatCents)}</dd>
          <dt className="text-muted">Υπόλοιπο ΦΠΑ βάρδιας</dt>
          <dd className="text-right">
            {formatEuro(Math.abs(preview.vatBalanceCents))} {status !== 'zero' && `(${VAT_STATUS_LABEL[status]})`}
          </dd>
          <dt className="text-muted">Συνολικά χλμ</dt>
          <dd className="text-right">{formatKm(preview.totalKm)}</dd>
          <dt className="font-semibold">Καθαρό κέρδος</dt>
          <dd className="text-right font-semibold">{formatEuro(preview.profitCents)}</dd>
        </dl>

        {message && <Notice tone={message.tone}>{message.text}</Notice>}

        <Button type="submit" variant="primary" className="w-full text-base" disabled={busy || !driver || inactiveSelf}>
          {busy ? 'Αποθήκευση…' : isEditing ? 'Αποθήκευση διορθώσεων' : `Καταχώρηση · ${periodLabel(year, month)}`}
        </Button>
        {isEditing && (
          <Button className="w-full" onClick={onCancelEdit} disabled={busy}>
            Ακύρωση
          </Button>
        )}
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
