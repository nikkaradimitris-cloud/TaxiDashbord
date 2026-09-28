'use client';

import { useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Button, Card, cx, Field, FieldRow, Input, Notice, Select } from '@/components/ui';
import { toCents } from '@/lib/accounting';
import { insertStatement, savePlatformRate, updateStatement } from '@/lib/data';
import { dataErrorMessage, isNetworkError } from '@/lib/errors';
import { formatEuro, formatSignedEuro } from '@/lib/format';
import { periodLabel } from '@/lib/period';
import {
  EMPTY_STATEMENT_FORM,
  findRate,
  fixedVatRate,
  formatWeek,
  isPlatform,
  MAX_REFERENCE,
  parseRateForm,
  parseStatementForm,
  PLATFORMS,
  platformLabel,
  rateFromRow,
  rateLabel,
  rateToFormValues,
  statementTitle,
  statementToFormValues,
  suggestedWeek,
  toRateValues,
  toStatementValues,
  toVatRate,
  weekCycles,
  type EntryRate,
  type RateFormValues,
  type StatementFormValues,
  type StatementKind,
} from '@/lib/platforms';
import type { Preferences } from '@/lib/storage';
import type { BrowserSupabase } from '@/lib/supabase/client';
import type { DriverRow, PlatformRateRow, StatementRow } from '@/lib/types';
import { DriverField, PeriodFields, SegmentedField, useEntryTarget, vehicleOptionLabel } from './EntryFields';

type Message = { tone: 'success' | 'error'; text: string };

const KINDS: readonly { id: StatementKind; label: string }[] = [
  { id: 'week', label: 'Εβδομαδιαία κίνηση' },
  { id: 'invoice', label: 'Τιμολόγιο μήνα' },
];

const VAT_CHOICES: readonly { id: '24' | '0'; label: string }[] = [
  { id: '24', label: 'Με ΦΠΑ 24%' },
  { id: '0', label: 'Χωρίς ΦΠΑ (ενδοκοινοτικό)' },
];

const percent = new Intl.NumberFormat('el-GR', { maximumFractionDigits: 2 });

/** Επιτρέπει μόνο ψηφία, κόμμα και τελεία (ποσά). */
function sanitizeAmount(value: string) {
  return value.replace(/[^\d.,]/g, '');
}

/** Το ποσοστό/ΦΠΑ με το οποίο γίνεται η καταχώρηση, σε λέξεις. */
function entryRateText(rate: EntryRate): string {
  if (rate.ratePct !== null) return rateLabel({ ratePct: rate.ratePct, vatRate: rate.vatRate });
  return rate.vatRate === 24 ? 'τιμολόγιο με ΦΠΑ 24%' : 'τιμολόγιο χωρίς ΦΠΑ';
}

/**
 * Εφαρμογή (Uber / FreeNow / Bolt) για το συγκεκριμένο αυτοκίνητο: η
 * εβδομάδα (διαδρομές και ποσό μετά την κράτηση, όπως τα δείχνει η εφαρμογή
 * στο κινητό — κράτηση και τζίρος βγαίνουν από το ποσοστό) ή το μηνιαίο
 * τιμολόγιο κρατήσεων. Το ποσοστό κάθε εφαρμογής ορίζεται μία φορά ανά
 * αυτοκίνητο και αλλάζει όταν χρειαστεί.
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
  rates,
  ratesLoaded,
  onRateSaved,
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
  /** Τα ποσοστά των εφαρμογών ανά αυτοκίνητο. */
  rates: readonly PlatformRateRow[];
  ratesLoaded: boolean;
  onRateSaved: (row: PlatformRateRow) => void;
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
  const platformName = platformLabel(values.platform);

  // ------------------------------------------------------------------
  // Ποσοστό: η ρύθμιση του αυτοκινήτου· σε διόρθωση, αυτό με το οποίο έγινε η καταχώρηση.
  // ------------------------------------------------------------------
  const setting = findRate(rates, driver?.id, values.platform);
  const usesEntryRate = editing !== null && editing.driver_id === driver?.id && editing.platform === values.platform;
  const rate: EntryRate | null = usesEntryRate
    ? { ratePct: editing.rate_pct ?? setting?.ratePct ?? null, vatRate: toVatRate(editing.vat_rate) }
    : setting;
  const hasVat = rate?.vatRate === 24;

  const rateKey = `${driver?.id ?? ''}|${values.platform}`;
  const [rateDraft, setRateDraft] = useState<(RateFormValues & { key: string }) | null>(null);
  const [rateErrors, setRateErrors] = useState<{ key: string; rate?: string; vat?: string } | null>(null);
  const [rateNotice, setRateNotice] = useState<(Message & { key: string }) | null>(null);
  const [rateBusy, setRateBusy] = useState(false);
  /** Χωρίς ρύθμιση: πρώτα ορίζεται το ποσοστό, μετά εμφανίζεται η υπόλοιπη φόρμα. */
  const needsRate = ratesLoaded && !usesEntryRate && setting === null;
  const draft = rateDraft?.key === rateKey ? rateDraft : null;
  const rateEditorOpen = needsRate || draft !== null;
  const rateValues = draft ?? rateToFormValues(setting, values.platform);
  const shownRateErrors: { rate?: string; vat?: string } = rateErrors?.key === rateKey ? rateErrors : {};
  const shownRateNotice = rateNotice?.key === rateKey ? rateNotice : null;

  function changeRate(changes: Partial<RateFormValues>) {
    setRateDraft({ ...rateValues, ...changes, key: rateKey });
    setRateErrors(null);
  }

  async function saveRate() {
    if (!driver || !isPlatform(values.platform)) return;
    const parsedRate = parseRateForm(rateValues, values.platform);
    if (!parsedRate.rate) {
      setRateErrors({ key: rateKey, ...parsedRate.errors });
      return;
    }
    setRateBusy(true);
    try {
      const row = await savePlatformRate(
        supabase,
        toRateValues(parsedRate.rate, { driverId: driver.id, platform: values.platform }),
      );
      onRateSaved(row);
      setRateDraft(null);
      setRateErrors(null);
      setRateNotice({
        key: rateKey,
        tone: 'success',
        text: `✓ Αποθηκεύτηκε: ${platformName} ${rateLabel(rateFromRow(row))} για ${vehicleOptionLabel(driver)}.`,
      });
    } catch (error) {
      setRateNotice({
        key: rateKey,
        tone: 'error',
        text: isNetworkError(error)
          ? 'Χωρίς σύνδεση: το ποσοστό δεν αποθηκεύτηκε. Δοκιμάστε ξανά μόλις έχετε internet.'
          : dataErrorMessage(error),
      });
    } finally {
      setRateBusy(false);
    }
  }

  function saveRateOnEnter(event: KeyboardEvent<HTMLInputElement>) {
    // Το Enter αποθηκεύει το ποσοστό, όχι την καταχώρηση.
    if (event.key === 'Enter') {
      event.preventDefault();
      void saveRate();
    }
  }

  // ------------------------------------------------------------------
  // Ό,τι έχει ήδη καταχωρηθεί για το αυτοκίνητο, τον μήνα και την εφαρμογή (εκτός από όσο διορθώνεται).
  // ------------------------------------------------------------------
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

  const parsed = parseStatementForm({ ...values, weekStart }, { year, month }, rate);
  const errors = showErrors ? parsed.errors : {};
  const { preview } = parsed;
  const auto = preview.auto;
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
      const amount = formatEuro(toCents(row.commission));
      setMessage({ tone: 'success', text: `✓ Καταχωρήθηκε: ${label} · ${isWeek ? `κράτηση ${amount}` : amount}` });
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

  const vatHint = hasVat
    ? 'Συμψηφίζεται'
    : values.platform === 'uber'
      ? 'Η Uber τιμολογεί χωρίς ΦΠΑ: δεν συμψηφίζεται.'
      : 'Χωρίς ΦΠΑ (ενδοκοινοτικό): δεν συμψηφίζεται.';
  const vatField = (
    <Field subgrid label={hasVat ? 'ΦΠΑ 24% (μέσα)' : 'ΦΠΑ'} hint={vatHint}>
      <output className="flex min-h-11 items-center rounded-xl border border-dashed border-line bg-bg px-3 text-base font-semibold tabular-nums">
        {hasVat ? formatEuro(preview.vatCents) : 'Χωρίς ΦΠΑ'}
      </output>
    </Field>
  );
  const amountInput = (label: string, hint?: string) => (
    <Field subgrid label={label} hint={hint} error={errors.commission}>
      <Input
        ref={firstInput}
        inputMode="decimal"
        autoComplete="off"
        placeholder="0,00"
        value={values.commission}
        aria-invalid={Boolean(errors.commission)}
        onChange={(e) => update({ commission: sanitizeAmount(e.target.value) })}
      />
    </Field>
  );

  const rateSection = !ratesLoaded ? (
    <p className="text-sm text-muted">Φόρτωση ποσοστών…</p>
  ) : rateEditorOpen ? (
    <fieldset className="space-y-3 rounded-xl border-2 border-accent bg-card p-3" aria-label={`Ποσοστό ${platformName}`}>
      <legend className="px-1 text-sm font-semibold">
        {setting ? `Αλλαγή ποσοστού ${platformName}` : `Ποσοστό ${platformName} (μία φορά)`}
      </legend>
      {!setting && (
        <p className="text-sm">
          Γράψτε το ποσοστό που κρατά η {platformName}
          {driver ? ` για το ${vehicleOptionLabel(driver)}` : ''}. Μετά η κράτηση υπολογίζεται μόνη της σε κάθε
          εβδομάδα.
        </p>
      )}
      <Field label="Ποσοστό κράτησης (%)" hint="Πάνω στον τζίρο χωρίς τα φιλοδωρήματα." error={shownRateErrors.rate}>
        <Input
          inputMode="decimal"
          autoComplete="off"
          placeholder="π.χ. 15"
          value={rateValues.rate}
          aria-invalid={Boolean(shownRateErrors.rate)}
          onChange={(e) => changeRate({ rate: sanitizeAmount(e.target.value) })}
          onKeyDown={saveRateOnEnter}
        />
      </Field>
      {fixedVatRate(values.platform) === 0 ? (
        <p className="rounded-xl bg-bg px-3 py-2 text-sm">
          Τιμολόγιο <b>χωρίς ΦΠΑ</b> (ενδοκοινοτικό) — σταθερό για την Uber.
        </p>
      ) : (
        <SegmentedField
          legend={`Τιμολόγιο ${platformName}`}
          name={`platform-vat-${values.platform}`}
          options={VAT_CHOICES}
          value={rateValues.vat}
          onChange={(vat) => changeRate({ vat })}
          error={shownRateErrors.vat}
        />
      )}
      {setting && (
        <p className="text-xs text-muted">
          Η αλλαγή ισχύει για τις επόμενες καταχωρήσεις· όσες έχουν ήδη γίνει δεν αλλάζουν.
        </p>
      )}
      {shownRateNotice?.tone === 'error' && <Notice tone="error">{shownRateNotice.text}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => void saveRate()} disabled={rateBusy || !driver || inactiveSelf}>
          {rateBusy ? 'Αποθήκευση…' : 'Αποθήκευση ποσοστού'}
        </Button>
        {setting && (
          <Button
            onClick={() => {
              setRateDraft(null);
              setRateErrors(null);
            }}
            disabled={rateBusy}
          >
            Ακύρωση
          </Button>
        )}
      </div>
    </fieldset>
  ) : rate ? (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-bg px-3 py-2 text-sm">
        <span>
          {usesEntryRate ? 'Αυτή η καταχώρηση' : `Ποσοστό ${platformName}`}: <b>{entryRateText(rate)}</b>
        </span>
        {!usesEntryRate && (
          <Button
            className="min-h-9 px-3 py-1"
            onClick={() => {
              changeRate(rateToFormValues(setting, values.platform));
              setRateNotice(null);
            }}
          >
            Αλλαγή
          </Button>
        )}
      </div>
      {shownRateNotice && <Notice tone={shownRateNotice.tone}>{shownRateNotice.text}</Notice>}
    </div>
  ) : null;

  return (
    <Card
      title={isEditing ? 'Επεξεργασία Εφαρμογής' : 'Καταχώρηση από Εφαρμογή'}
      id={isEditing ? 'platform-edit-form' : 'platform-form'}
      className={cx(isEditing && 'ring-2 ring-accent-strong')}
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {switcher}
        <p className="text-sm text-muted">
          Κάθε εβδομάδα: διαδρομές και ποσό όπως τα δείχνει η εφαρμογή στο κινητό. Κάθε μήνα: το τιμολόγιο της εφαρμογής.
          Έτσι φαίνεται πόσες διαδρομές ήταν από τον δρόμο και πόσα κρατάει η εφαρμογή.
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
        {rateSection}

        {rate && !needsRate && (
          <>
            <SegmentedField
              legend="Τι καταχωρείτε"
              name="statement-kind"
              options={KINDS}
              value={values.kind}
              onChange={(kind) => update({ kind })}
              error={errors.kind}
            />

            {errors.rate && <Notice tone="error">{errors.rate}</Notice>}

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
                    Όλες οι εβδομάδες του μήνα έχουν καταχωρηθεί για {platformName}. Για αλλαγή πατήστε «Επεξεργασία» στη
                    λίστα «Εφαρμογές».
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
                  <Field
                    subgrid
                    label="Ποσό μετά την κράτηση (€) *"
                    hint="Όπως το δείχνει η εφαρμογή."
                    error={errors.payout}
                  >
                    <Input
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder="0,00"
                      value={values.payout}
                      aria-invalid={Boolean(errors.payout)}
                      onChange={(e) => update({ payout: sanitizeAmount(e.target.value) })}
                    />
                  </Field>
                </FieldRow>
                <Field
                  label="Φιλοδωρήματα (€)"
                  hint="Όσα είναι μέσα στο ποσό. Η εφαρμογή δεν κρατά ποσοστό από αυτά."
                  error={errors.tips}
                >
                  <Input
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="0,00"
                    value={values.tips}
                    aria-invalid={Boolean(errors.tips)}
                    onChange={(e) => update({ tips: sanitizeAmount(e.target.value) })}
                  />
                </Field>

                {auto && rate.ratePct !== null && (
                  <section
                    aria-label="Υπολογίζεται αυτόματα"
                    className="rounded-xl border border-dashed border-line bg-bg p-3 text-sm"
                  >
                    <p className="mb-1 text-xs font-semibold text-muted">Υπολογίζεται αυτόματα</p>
                    <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 tabular-nums">
                      <dt>Ποσό μετά την κράτηση</dt>
                      <dd className="text-right">{formatEuro(auto.payoutCents)}</dd>
                      <dt>+ Κράτηση {percent.format(rate.ratePct)}%</dt>
                      <dd className="text-right">{formatEuro(auto.netCents)}</dd>
                      {hasVat && (
                        <>
                          <dt>+ ΦΠΑ 24% της κράτησης</dt>
                          <dd className="text-right">{formatEuro(auto.vatCents)}</dd>
                        </>
                      )}
                      <dt className="border-t border-line pt-1 font-semibold">= Τζίρος</dt>
                      <dd className="border-t border-line pt-1 text-right font-semibold">
                        {formatEuro(auto.turnoverCents)}
                      </dd>
                    </dl>
                    <p className="mt-2 text-muted">
                      Στα έξοδα: κράτηση{hasVat ? ' με ΦΠΑ' : ''}{' '}
                      <b className="whitespace-nowrap text-fg tabular-nums">{formatEuro(auto.totalCents)}</b>.{' '}
                      {hasVat ? 'Ο ΦΠΑ συμψηφίζεται.' : vatHint}
                      {auto.baseCents !== auto.turnoverCents &&
                        ` Το ${percent.format(rate.ratePct)}% μετράει χωρίς τα φιλοδωρήματα.`}
                    </p>
                  </section>
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
                <FieldRow>
                  {amountInput(`Ποσό τιμολογίου${hasVat ? ' με ΦΠΑ' : ''} (€) *`)}
                  {vatField}
                </FieldRow>
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
          </>
        )}
        {isEditing && (
          <Button className="w-full" onClick={onCancelEdit} disabled={busy}>
            Ακύρωση
          </Button>
        )}
      </form>
    </Card>
  );
}
