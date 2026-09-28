'use client';

import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Button, Card, cx, Field, FieldRow, Input, Notice, Select } from '@/components/ui';
import { toCents } from '@/lib/accounting';
import { insertStatement, updateStatement } from '@/lib/data';
import { dataErrorMessage, isNetworkError } from '@/lib/errors';
import { formatEuro, formatPercent, formatSignedEuro } from '@/lib/format';
import { periodLabel } from '@/lib/period';
import {
  EMPTY_STATEMENT_FORM,
  formatWeek,
  MAX_REFERENCE,
  parseStatementForm,
  PLATFORMS,
  platformHasVat,
  platformLabel,
  statementTitle,
  statementToFormValues,
  suggestedWeek,
  toStatementValues,
  weekCycles,
  type StatementFormValues,
  type StatementKind,
} from '@/lib/platforms';
import type { Preferences } from '@/lib/storage';
import type { BrowserSupabase } from '@/lib/supabase/client';
import type { DriverRow, StatementRow } from '@/lib/types';
import { DriverField, PeriodFields, SegmentedField, useEntryTarget, vehicleOptionLabel } from './EntryFields';

type Message = { tone: 'success' | 'error'; text: string };

const KINDS: readonly { id: StatementKind; label: string }[] = [
  { id: 'week', label: 'Εβδομαδιαία κίνηση' },
  { id: 'invoice', label: 'Τιμολόγιο μήνα' },
];

/** Επιτρέπει μόνο ψηφία, κόμμα και τελεία (ποσά). */
function sanitizeAmount(value: string) {
  return value.replace(/[^\d.,]/g, '');
}

/**
 * Εφαρμογή (Uber / FreeNow) για το συγκεκριμένο αυτοκίνητο: η εβδομαδιαία
 * κίνηση (διαδρομές, τζίρος, κράτηση) ή το μηνιαίο τιμολόγιο κρατήσεων.
 */
export function PlatformForm({
  supabase,
  isAdmin,
  drivers,
  driversLoaded,
  prefs,
  driverFilter,
  onPrefsChange,
  statements,
  today,
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
  /** Οι καταχωρήσεις της προβολής: ποιες εβδομάδες / ποιο τιμολόγιο υπάρχουν ήδη. */
  statements: readonly StatementRow[];
  /** Σημερινή ημερομηνία 'YYYY-MM-DD' (για την προτεινόμενη εβδομάδα). */
  today: string;
  onSaved: (row: StatementRow) => void;
  /** Καταχώρηση προς διόρθωση (null = νέα). Όταν αλλάζει, το component ξαναστήνεται (key). */
  editing: StatementRow | null;
  onUpdated: (row: StatementRow) => void;
  onCancelEdit: () => void;
  /** Διακόπτης «Βάρδια | Έξοδο οχήματος | Εφαρμογή» (μόνο στη νέα καταχώρηση). */
  switcher?: ReactNode;
}) {
  const [values, setValues] = useState<StatementFormValues>(() =>
    editing ? statementToFormValues(editing) : EMPTY_STATEMENT_FORM,
  );
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const firstInput = useRef<HTMLInputElement>(null);

  const target = useEntryTarget({ isAdmin, drivers, prefs, driverFilter, onPrefsChange, editing });
  const { isEditing, year, month, driver, inactiveSelf } = target;
  const isWeek = values.kind === 'week';
  const hasVat = platformHasVat(values.platform);
  const platformName = platformLabel(values.platform);

  // Ό,τι έχει ήδη καταχωρηθεί για το αυτοκίνητο, τον μήνα και την εφαρμογή (εκτός από όσο διορθώνεται).
  const existing = statements.filter(
    (row) =>
      row.driver_id === driver?.id &&
      row.year === year &&
      row.month === month &&
      row.platform === values.platform &&
      row.id !== editing?.id,
  );
  const enteredWeeks = new Set(existing.flatMap((row) => (row.kind === 'week' && row.week_start ? [row.week_start] : [])));
  const existingInvoice = existing.find((row) => row.kind === 'invoice') ?? null;
  const weeksCommissionCents = existing.reduce(
    (sum, row) => sum + (row.kind === 'week' ? toCents(Number(row.commission)) : 0),
    0,
  );

  // Η εβδομάδα: όποια διάλεξε ο χρήστης, αλλιώς η επόμενη που λείπει.
  const cycles = weekCycles(year, month);
  const weekStart =
    cycles.some((week) => week.start === values.weekStart) && !enteredWeeks.has(values.weekStart)
      ? values.weekStart
      : suggestedWeek(cycles, enteredWeeks, today);
  const selectedWeek = cycles.find((week) => week.start === weekStart) ?? null;

  const parsed = parseStatementForm({ ...values, weekStart }, { year, month });
  const errors = showErrors ? parsed.errors : {};
  const { preview } = parsed;
  /** Υπάρχει ήδη: όλες οι εβδομάδες του μήνα ή το τιμολόγιο του μήνα. */
  const alreadyDone = isWeek ? selectedWeek === null : existingInvoice !== null;

  function update(changes: Partial<StatementFormValues>) {
    setValues((prev) => ({ ...prev, ...changes }));
    if (message?.tone !== 'error') setMessage(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setShowErrors(true);
    setMessage(null);
    if (!parsed.input || !driver || alreadyDone) return;

    const row = toStatementValues(parsed.input, { driverId: driver.id, year, month });
    const label = `${statementTitle(row)} · ${vehicleOptionLabel(driver)}`;
    setBusy(true);
    try {
      if (editing) {
        const updated = await updateStatement(supabase, editing.id, row);
        if (!updated) {
          setMessage({
            tone: 'error',
            text: 'Η διόρθωση δεν επιτρέπεται. Οι οδηγοί διορθώνουν μόνο δικές τους καταχωρήσεις μέσα σε 24 ώρες.',
          });
          return;
        }
        onUpdated(updated);
        return;
      }
      const saved = await insertStatement(supabase, row);
      onSaved(saved);
      // Επόμενη καταχώρηση: ίδια εφαρμογή και είδος, η επόμενη εβδομάδα που λείπει.
      setValues((prev) => ({ ...EMPTY_STATEMENT_FORM, platform: prev.platform, kind: prev.kind }));
      setShowErrors(false);
      setMessage({ tone: 'success', text: `✓ Καταχωρήθηκε: ${label}` });
      firstInput.current?.focus();
    } catch (error) {
      setMessage({
        tone: 'error',
        text: isNetworkError(error)
          ? 'Χωρίς σύνδεση: η καταχώρηση δεν αποθηκεύτηκε. Δοκιμάστε ξανά μόλις έχετε internet.'
          : dataErrorMessage(error),
      });
    } finally {
      setBusy(false);
    }
  }

  const commissionField = (
    <FieldRow>
      <Field
        subgrid
        label={`${isWeek ? 'Κράτηση' : 'Ποσό τιμολογίου'}${hasVat ? ' με ΦΠΑ' : ''} (€) *`}
        error={errors.commission}
      >
        <Input
          ref={isWeek ? undefined : firstInput}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0,00"
          value={values.commission}
          aria-invalid={Boolean(errors.commission)}
          onChange={(e) => update({ commission: sanitizeAmount(e.target.value) })}
        />
      </Field>
      <Field
        subgrid
        label={hasVat ? 'ΦΠΑ 24% (μέσα)' : 'ΦΠΑ'}
        hint={hasVat ? 'Συμψηφίζεται' : 'Η Uber τιμολογεί χωρίς ΦΠΑ: δεν συμψηφίζεται.'}
      >
        <output className="flex min-h-11 items-center rounded-xl border border-dashed border-line bg-bg px-3 text-base font-semibold tabular-nums">
          {hasVat ? formatEuro(preview.vatCents) : 'Χωρίς ΦΠΑ'}
        </output>
      </Field>
    </FieldRow>
  );

  return (
    <Card
      title={isEditing ? 'Επεξεργασία Εφαρμογής' : 'Καταχώρηση από Εφαρμογή'}
      id={isEditing ? 'platform-edit-form' : 'platform-form'}
      className={cx(isEditing && 'ring-2 ring-accent-strong')}
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {switcher}
        <p className="text-sm text-muted">
          Από την εβδομαδιαία κίνηση και το μηνιαίο τιμολόγιο της εφαρμογής. Έτσι φαίνεται πόσες διαδρομές ήταν από τον
          δρόμο και πόσα κρατάει η εφαρμογή.
        </p>
        <PeriodFields target={target} prefs={prefs} onPrefsChange={onPrefsChange} />
        <DriverField
          target={target}
          isAdmin={isAdmin}
          driversLoaded={driversLoaded}
          label="Αυτοκίνητο"
          optionLabel={vehicleOptionLabel}
        />
        <SegmentedField
          legend="Εφαρμογή"
          name="platform"
          options={PLATFORMS}
          value={values.platform}
          onChange={(platform) => update({ platform })}
          error={errors.platform}
        />
        <SegmentedField
          legend="Τι καταχωρείτε"
          name="statement-kind"
          options={KINDS}
          value={values.kind}
          onChange={(kind) => update({ kind })}
          error={errors.kind}
        />

        {isWeek ? (
          <>
            <Field
              label="Εβδομάδα (Δευτέρα–Κυριακή)"
              hint="Στην αλλαγή του μήνα η εβδομάδα κόβεται: κάθε κομμάτι μετράει στον δικό του μήνα."
              error={errors.weekStart}
            >
              <Select value={weekStart} onChange={(e) => update({ weekStart: e.target.value })} disabled={!selectedWeek}>
                {!selectedWeek && <option value="">— Όλες καταχωρημένες —</option>}
                {cycles.map((week) => {
                  const done = enteredWeeks.has(week.start);
                  return (
                    <option key={week.start} value={week.start} disabled={done}>
                      {formatWeek(week.start, week.end)}
                      {week.days < 7 ? ` (${week.days} ${week.days === 1 ? 'ημέρα' : 'ημέρες'})` : ''}
                      {done ? ' ✓ καταχωρημένη' : ''}
                    </option>
                  );
                })}
              </Select>
            </Field>
            {alreadyDone && (
              <Notice tone="info">
                Όλες οι εβδομάδες του μήνα έχουν καταχωρηθεί για {platformName}. Για αλλαγή πατήστε «Επεξεργασία» στη λίστα
                «Εφαρμογές».
              </Notice>
            )}
            <FieldRow>
              <Field subgrid label="Διαδρομές *" error={errors.trips}>
                <Input
                  ref={firstInput}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="0"
                  value={values.trips}
                  aria-invalid={Boolean(errors.trips)}
                  onChange={(e) => update({ trips: e.target.value.replace(/\D/g, '') })}
                />
              </Field>
              <Field subgrid label="Τζίρος (€) *" error={errors.turnover}>
                <Input
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0,00"
                  value={values.turnover}
                  aria-invalid={Boolean(errors.turnover)}
                  onChange={(e) => update({ turnover: sanitizeAmount(e.target.value) })}
                />
              </Field>
            </FieldRow>
            {commissionField}
            {preview.ratePct !== null && (
              <p className="text-sm text-muted">Η εφαρμογή κρατά το {formatPercent(preview.ratePct)} του τζίρου.</p>
            )}
          </>
        ) : (
          <>
            {existingInvoice && (
              <Notice tone="info">
                Υπάρχει ήδη τιμολόγιο {platformName} για {periodLabel(year, month)}:{' '}
                {formatEuro(toCents(Number(existingInvoice.commission)))}. Για αλλαγή πατήστε «Επεξεργασία» στη λίστα
                «Εφαρμογές».
              </Notice>
            )}
            {commissionField}
            <Field label="Αριθμός τιμολογίου" hint="Προαιρετικά." error={errors.reference}>
              <Input
                autoComplete="off"
                maxLength={MAX_REFERENCE}
                value={values.reference}
                aria-invalid={Boolean(errors.reference)}
                onChange={(e) => update({ reference: e.target.value })}
              />
            </Field>
            {enteredWeeks.size > 0 && (
              <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 rounded-xl bg-bg p-3 text-sm tabular-nums">
                <dt className="text-muted">Κρατήσεις εβδομάδων ({enteredWeeks.size})</dt>
                <dd className="text-right">{formatEuro(weeksCommissionCents)}</dd>
                <dt className="text-muted">Διαφορά τιμολογίου</dt>
                <dd className="text-right">
                  {values.commission.trim() ? formatSignedEuro(preview.commissionCents - weeksCommissionCents) : '—'}
                </dd>
              </dl>
            )}
            <p className="text-sm text-muted">
              Με το τιμολόγιο, στα έξοδα και στον ΦΠΑ μετράει το ποσό του τιμολογίου αντί για τις εβδομάδες.
            </p>
          </>
        )}

        {message && <Notice tone={message.tone}>{message.text}</Notice>}

        <Button
          type="submit"
          variant="primary"
          className="w-full text-base"
          disabled={busy || !driver || inactiveSelf || alreadyDone}
        >
          {busy ? (
            'Αποθήκευση…'
          ) : isEditing ? (
            'Αποθήκευση διορθώσεων'
          ) : isWeek ? (
            <span>
              Καταχώρηση εβδομάδας
              {selectedWeek && (
                <>
                  {' · '}
                  <span className="whitespace-nowrap">{formatWeek(selectedWeek.start, selectedWeek.end)}</span>
                </>
              )}
            </span>
          ) : (
            `Καταχώρηση τιμολογίου · ${periodLabel(year, month)}`
          )}
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
