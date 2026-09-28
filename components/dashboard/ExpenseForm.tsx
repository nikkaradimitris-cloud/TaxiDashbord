'use client';

import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Button, Card, cx, Field, Input, Notice, Select } from '@/components/ui';
import { toCents } from '@/lib/accounting';
import { insertExpense, updateExpense } from '@/lib/data';
import { dataErrorMessage, isNetworkError } from '@/lib/errors';
import {
  categoryLabel,
  EMPTY_EXPENSE_FORM,
  EXPENSE_CATEGORIES,
  expenseToFormValues,
  isExpenseCategory,
  MAX_DESCRIPTION,
  parseExpenseForm,
  toExpenseValues,
  type ExpenseFormValues,
} from '@/lib/expenses';
import { formatEuro } from '@/lib/format';
import { periodLabel } from '@/lib/period';
import type { Preferences } from '@/lib/storage';
import type { BrowserSupabase } from '@/lib/supabase/client';
import type { DriverRow, ExpenseRow } from '@/lib/types';
import { DriverField, PeriodFields, useEntryTarget, vehicleOptionLabel } from './EntryFields';

type Message = { tone: 'success' | 'error'; text: string };

/**
 * Έξοδο οχήματος εκτός βάρδιας (επισκευή, service, λάστιχα, πλύσιμο…):
 * μήνας/έτος, αυτοκίνητο, κατηγορία, τελικό ποσό (ΦΠΑ 24% μέσα), περιγραφή.
 */
export function ExpenseForm({
  supabase,
  isAdmin,
  drivers,
  driversLoaded,
  prefs,
  driverFilter,
  onPrefsChange,
  onSaved,
  editing,
  onUpdated,
  onCancelEdit,
  switcher,
}: {
  supabase: BrowserSupabase;
  isAdmin: boolean;
  drivers: DriverRow[];
  driversLoaded: boolean;
  prefs: Preferences;
  driverFilter: string;
  onPrefsChange: (changes: Partial<Omit<Preferences, 'today'>>) => void;
  onSaved: (row: ExpenseRow) => void;
  /** Έξοδο προς διόρθωση (null = νέα καταχώρηση). Όταν αλλάζει, το component ξαναστήνεται (key). */
  editing: ExpenseRow | null;
  onUpdated: (row: ExpenseRow) => void;
  onCancelEdit: () => void;
  /** Διακόπτης «Βάρδια | Έξοδο οχήματος» (μόνο στη νέα καταχώρηση). */
  switcher?: ReactNode;
}) {
  const [values, setValues] = useState<ExpenseFormValues>(() =>
    editing ? expenseToFormValues(editing) : EMPTY_EXPENSE_FORM,
  );
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const amountInput = useRef<HTMLInputElement>(null);

  const target = useEntryTarget({ isAdmin, drivers, prefs, driverFilter, onPrefsChange, editing });
  const { isEditing, year, month, driver, inactiveSelf } = target;

  const parsed = parseExpenseForm(values);
  const errors = showErrors ? parsed.errors : {};

  function update(changes: Partial<ExpenseFormValues>) {
    setValues((prev) => ({ ...prev, ...changes }));
    if (message?.tone !== 'error') setMessage(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setShowErrors(true);
    setMessage(null);
    if (parsed.amount === null || !driver) return;

    const row = toExpenseValues(values, parsed.amount, { driverId: driver.id, year, month });
    const label = `${categoryLabel(values.category)} ${formatEuro(toCents(parsed.amount))} · ${vehicleOptionLabel(driver)} · ${periodLabel(year, month)}`;
    setBusy(true);
    try {
      if (editing) {
        const updated = await updateExpense(supabase, editing.id, row);
        if (!updated) {
          setMessage({
            tone: 'error',
            text: 'Η διόρθωση δεν επιτρέπεται. Οι οδηγοί διορθώνουν μόνο δικά τους έξοδα μέσα σε 24 ώρες.',
          });
          return;
        }
        onUpdated(updated);
        return;
      }
      const saved = await insertExpense(supabase, row);
      onSaved(saved);
      setValues(EMPTY_EXPENSE_FORM);
      setShowErrors(false);
      setMessage({ tone: 'success', text: `✓ Καταχωρήθηκε: ${label}` });
      amountInput.current?.focus();
    } catch (error) {
      setMessage({
        tone: 'error',
        text: isNetworkError(error)
          ? 'Χωρίς σύνδεση: το έξοδο δεν αποθηκεύτηκε. Δοκιμάστε ξανά μόλις έχετε internet.'
          : dataErrorMessage(error),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title={isEditing ? 'Επεξεργασία Εξόδου Οχήματος' : 'Καταχώρηση Εξόδου Οχήματος'}
      id={isEditing ? 'expense-edit-form' : 'expense-form'}
      className={cx(isEditing && 'ring-2 ring-accent-strong')}
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {switcher}
        <p className="text-sm text-muted">
          Επισκευές, service, λάστιχα, πλύσιμο κ.λπ. — για το αυτοκίνητο, εκτός βάρδιας. Μετράνε στα έξοδα, στον ΦΠΑ
          και στο ταμείο του μήνα.
        </p>
        <PeriodFields target={target} prefs={prefs} onPrefsChange={onPrefsChange} />
        <DriverField
          target={target}
          isAdmin={isAdmin}
          driversLoaded={driversLoaded}
          label="Αυτοκίνητο"
          optionLabel={vehicleOptionLabel}
        />

        <Field label="Κατηγορία" error={errors.category}>
          <Select
            value={values.category}
            onChange={(e) => {
              if (isExpenseCategory(e.target.value)) update({ category: e.target.value });
            }}
          >
            {EXPENSE_CATEGORIES.map((category) => (
              <option key={category.id} value={category.id}>
                {category.label}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Ποσό με ΦΠΑ (€) *" error={errors.amount}>
            <Input
              ref={amountInput}
              inputMode="decimal"
              autoComplete="off"
              placeholder="0,00"
              value={values.amount}
              aria-invalid={Boolean(errors.amount)}
              onChange={(e) => update({ amount: e.target.value.replace(/[^\d.,]/g, '') })}
            />
          </Field>
          <Field label="ΦΠΑ 24% (μέσα)" hint="Ποσό ÷ 1,24 × 0,24">
            <output className="flex min-h-11 items-center rounded-xl border border-dashed border-line bg-bg px-3 text-base font-semibold tabular-nums">
              {formatEuro(parsed.preview.vatCents)}
            </output>
          </Field>
        </div>

        <Field
          label="Περιγραφή"
          hint="Προαιρετικά, π.χ. «Φρένα – συνεργείο» ή αριθμός τιμολογίου."
          error={errors.description}
        >
          <Input
            autoComplete="off"
            maxLength={MAX_DESCRIPTION}
            value={values.description}
            aria-invalid={Boolean(errors.description)}
            onChange={(e) => update({ description: e.target.value })}
          />
        </Field>

        {message && <Notice tone={message.tone}>{message.text}</Notice>}

        <Button type="submit" variant="primary" className="w-full text-base" disabled={busy || !driver || inactiveSelf}>
          {busy ? 'Αποθήκευση…' : isEditing ? 'Αποθήκευση διορθώσεων' : `Καταχώρηση εξόδου · ${periodLabel(year, month)}`}
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
