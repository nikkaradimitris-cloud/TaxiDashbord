/**
 * Εφαρμογές (Uber / FreeNow): εβδομαδιαία κίνηση και μηνιαίο τιμολόγιο.
 *
 * - Εβδομάδα = Δευτέρα–Κυριακή, κομμένη στην αλλαγή του μήνα (ίδιος κανόνας
 *   με τη βάση): ο Οκτώβριος 2026 ξεκινά Πέμπτη → 1–4, 5–11, …, 26–31 Οκτ.
 * - Οι κούρσες των εφαρμογών είναι μέσα στο Ζ: διαδρομές από τον δρόμο =
 *   διαδρομές Ζ − διαδρομές εφαρμογών.
 * - Κράτηση: μετράει το τιμολόγιο του μήνα όταν υπάρχει, αλλιώς το άθροισμα
 *   των εβδομάδων. FreeNow: ΦΠΑ 24% μέσα (συμψηφίζεται). Uber: χωρίς ΦΠΑ.
 */
import { includedExpenseVatCents, round2, toCents, type PlatformFigures } from './accounting';
import { parseDecimal, parseOptionalInteger } from './numbers';
import { periodLabel } from './period';
import type { StatementInsert, StatementRow } from './types';

export const PLATFORMS = [
  { id: 'uber', label: 'Uber', hasVat: false },
  { id: 'freenow', label: 'FreeNow', hasVat: true },
] as const;

export type PlatformId = (typeof PLATFORMS)[number]['id'];

/** 'week': εβδομαδιαία κίνηση · 'invoice': μηνιαίο τιμολόγιο κρατήσεων. */
export type StatementKind = 'week' | 'invoice';

export function isPlatform(value: unknown): value is PlatformId {
  return PLATFORMS.some((platform) => platform.id === value);
}

export function platformLabel(id: string): string {
  return PLATFORMS.find((platform) => platform.id === id)?.label ?? id;
}

/** Το τιμολόγιο της εφαρμογής έχει ΦΠΑ 24% (που συμψηφίζεται); */
export function platformHasVat(id: string): boolean {
  return PLATFORMS.find((platform) => platform.id === id)?.hasVat ?? false;
}

/** ΦΠΑ μέσα στην κράτηση, σε λεπτά: FreeNow 24% εμπεριεχόμενος, Uber 0. */
export function commissionVatCents(platform: string, commissionCents: number): number {
  return platformHasVat(platform) ? includedExpenseVatCents(commissionCents) : 0;
}

// ---------------------------------------------------------------------------
// Εβδομάδες του μήνα
// ---------------------------------------------------------------------------

/** Μία εβδομάδα μέσα στον μήνα (ημερομηνίες 'YYYY-MM-DD'). */
export interface WeekCycle {
  start: string;
  end: string;
  days: number;
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Οι εβδομάδες (Δευτέρα–Κυριακή) του μήνα, κομμένες στα όρια του μήνα.
 * Π.χ. Οκτώβριος 2026 (ξεκινά Πέμπτη): 1–4, 5–11, 12–18, 19–25, 26–31.
 */
export function weekCycles(year: number, month: number): WeekCycle[] {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cycles: WeekCycle[] = [];
  let startDay = 1;
  for (let day = 1; day <= lastDay; day++) {
    const isSunday = new Date(Date.UTC(year, month - 1, day)).getUTCDay() === 0;
    if (isSunday || day === lastDay) {
      cycles.push({ start: isoDate(year, month, startDay), end: isoDate(year, month, day), days: day - startDay + 1 });
      startDay = day + 1;
    }
  }
  return cycles;
}

const SHORT_MONTHS = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαΐ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ'];

/** «7–13 Σεπ» (αρχή και τέλος στον ίδιο μήνα). */
export function formatWeek(start: string, end: string): string {
  const [, month, startDay] = start.split('-').map(Number);
  const endDay = Number(end.split('-')[2]);
  const range = startDay === endDay ? `${startDay}` : `${startDay}–${endDay}`;
  return `${range} ${SHORT_MONTHS[month - 1] ?? ''}`.trim();
}

/** «Uber · εβδομάδα 7–13 Σεπ» ή «FreeNow · τιμολόγιο Σεπτέμβριος 2026». */
export function statementTitle(row: {
  platform: string;
  kind: string;
  week_start?: string | null;
  year: number;
  month: number;
}): string {
  const platform = platformLabel(row.platform);
  if (row.kind === 'invoice') return `${platform} · τιμολόγιο ${periodLabel(row.year, row.month)}`;
  const week = weekCycles(row.year, row.month).find((cycle) => cycle.start === row.week_start);
  return `${platform} · εβδομάδα ${week ? formatWeek(week.start, week.end) : (row.week_start ?? '')}`;
}

/** Σημερινή ημερομηνία της συσκευής ως 'YYYY-MM-DD'. */
export function todayIso(now = new Date()): string {
  return isoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/**
 * Η εβδομάδα που προτείνει η φόρμα: η πρώτη που λείπει και έχει ήδη ξεκινήσει
 * (συνήθως η προηγούμενη), αλλιώς η πρώτη που λείπει· '' αν έχουν μπει όλες.
 */
export function suggestedWeek(cycles: readonly WeekCycle[], entered: ReadonlySet<string>, today: string): string {
  const open = cycles.filter((week) => !entered.has(week.start));
  return (open.find((week) => week.start <= today) ?? open[0])?.start ?? '';
}

export type WeekState = 'done' | 'missing' | 'open';

/** Καταχωρημένη, λείπει (έχει τελειώσει) ή ανοιχτή (σε εξέλιξη / επόμενη). */
export function weekState(week: WeekCycle, entered: ReadonlySet<string>, today: string): WeekState {
  if (entered.has(week.start)) return 'done';
  return week.end < today ? 'missing' : 'open';
}

// ---------------------------------------------------------------------------
// Φόρμα
// ---------------------------------------------------------------------------

/** Οι τιμές της φόρμας όπως τις πληκτρολογεί ο χρήστης. */
export interface StatementFormValues {
  platform: PlatformId;
  kind: StatementKind;
  /** Η αρχή της εβδομάδας ('YYYY-MM-DD'), μόνο για εβδομάδα. */
  weekStart: string;
  trips: string;
  turnover: string;
  /** Εβδομάδα: η κράτηση της εβδομάδας · Τιμολόγιο: το ποσό του τιμολογίου. */
  commission: string;
  /** Αριθμός τιμολογίου (προαιρετικά). */
  reference: string;
}

export const EMPTY_STATEMENT_FORM: StatementFormValues = {
  platform: 'uber',
  kind: 'week',
  weekStart: '',
  trips: '',
  turnover: '',
  commission: '',
  reference: '',
};

export type StatementFormErrors = Partial<Record<keyof StatementFormValues, string>>;

export interface StatementInput {
  platform: PlatformId;
  kind: StatementKind;
  weekStart: string | null;
  trips: number;
  turnover: number;
  commission: number;
  reference: string;
}

export interface ParsedStatementForm {
  /** null όταν υπάρχουν σφάλματα. */
  input: StatementInput | null;
  errors: StatementFormErrors;
  /** Ζωντανή προεπισκόπηση (άκυρα ποσά → 0). */
  preview: {
    commissionCents: number;
    vatCents: number;
    /** Η κράτηση ως % του τζίρου (μόνο εβδομάδα με τζίρο). */
    ratePct: number | null;
  };
}

export const MAX_REFERENCE = 60;
const MAX_AMOUNT = 1_000_000;
const MAX_TRIPS = 100_000;

/** Ποσό σε ευρώ, ή σφάλμα. */
function parseAmount(raw: string, emptyMessage: string): { value: number | null; error?: string } {
  if (!raw.trim()) return { value: null, error: emptyMessage };
  const value = parseDecimal(raw);
  if (value === null) return { value: null, error: 'Μη έγκυρος αριθμός (π.χ. 36,40).' };
  if (value >= MAX_AMOUNT) return { value: null, error: 'Μη ρεαλιστική τιμή.' };
  return { value: round2(value) };
}

export function parseStatementForm(
  values: StatementFormValues,
  period: { year: number; month: number },
): ParsedStatementForm {
  const errors: StatementFormErrors = {};
  const isWeek = values.kind === 'week';

  if (!isPlatform(values.platform)) errors.platform = 'Επιλέξτε εφαρμογή.';
  if (values.kind !== 'week' && values.kind !== 'invoice') errors.kind = 'Επιλέξτε τι καταχωρείτε.';

  let weekStart: string | null = null;
  let trips = 0;
  let turnover: number | null = 0;
  if (isWeek) {
    weekStart = weekCycles(period.year, period.month).find((week) => week.start === values.weekStart)?.start ?? null;
    if (!weekStart) errors.weekStart = 'Επιλέξτε εβδομάδα.';

    const parsedTrips = parseOptionalInteger(values.trips);
    if (!values.trips.trim()) errors.trips = 'Γράψτε τις διαδρομές (ή 0).';
    else if (parsedTrips === null || parsedTrips > MAX_TRIPS) errors.trips = 'Ακέραιος αριθμός (π.χ. 12).';
    else trips = parsedTrips;

    const parsedTurnover = parseAmount(values.turnover, 'Γράψτε τον τζίρο (ή 0).');
    if (parsedTurnover.error) errors.turnover = parsedTurnover.error;
    turnover = parsedTurnover.value;
  }

  const parsedCommission = parseAmount(
    values.commission,
    isWeek ? 'Γράψτε την κράτηση (ή 0).' : 'Γράψτε το ποσό του τιμολογίου.',
  );
  const commission = parsedCommission.value;
  if (parsedCommission.error) errors.commission = parsedCommission.error;
  else if (!isWeek && commission! <= 0) errors.commission = 'Το ποσό πρέπει να είναι μεγαλύτερο από 0.';
  else if (isWeek && turnover !== null && commission! > turnover) {
    errors.commission = 'Η κράτηση δεν μπορεί να είναι μεγαλύτερη από τον τζίρο.';
  }

  const reference = isWeek ? '' : values.reference.trim();
  if (reference.length > MAX_REFERENCE) errors.reference = `Έως ${MAX_REFERENCE} χαρακτήρες.`;

  const commissionCents = toCents(commission ?? 0);
  const turnoverCents = toCents(turnover ?? 0);
  const valid = Object.keys(errors).length === 0;
  return {
    input: valid
      ? {
          platform: values.platform,
          kind: values.kind,
          weekStart,
          trips,
          turnover: turnover ?? 0,
          commission: commission ?? 0,
          reference,
        }
      : null,
    errors,
    preview: {
      commissionCents,
      vatCents: commissionVatCents(values.platform, commissionCents),
      ratePct: isWeek && turnoverCents > 0 ? (commissionCents / turnoverCents) * 100 : null,
    },
  };
}

/** Οι στήλες για τη βάση (ο ΦΠΑ και το τέλος της εβδομάδας υπολογίζονται από τη βάση). */
export function toStatementValues(
  input: StatementInput,
  meta: { driverId: string; year: number; month: number },
): StatementInsert {
  const isWeek = input.kind === 'week';
  return {
    driver_id: meta.driverId,
    platform: input.platform,
    kind: input.kind,
    year: meta.year,
    month: meta.month,
    week_start: isWeek ? input.weekStart : null,
    trips: isWeek ? input.trips : 0,
    turnover: isWeek ? round2(input.turnover) : 0,
    commission: round2(input.commission),
    reference: isWeek ? '' : input.reference,
  };
}

function decimalText(value: number): string {
  return String(round2(Number(value))).replace('.', ',');
}

/** Αποθηκευμένη καταχώρηση → τιμές φόρμας, για διόρθωση (ελληνική υποδιαστολή). */
export function statementToFormValues(
  row: Pick<StatementRow, 'platform' | 'kind' | 'week_start' | 'trips' | 'turnover' | 'commission' | 'reference'>,
): StatementFormValues {
  const isWeek = row.kind !== 'invoice';
  return {
    platform: isPlatform(row.platform) ? row.platform : 'uber',
    kind: isWeek ? 'week' : 'invoice',
    weekStart: row.week_start ?? '',
    trips: isWeek ? String(row.trips) : '',
    turnover: isWeek ? decimalText(row.turnover) : '',
    commission: decimalText(row.commission),
    reference: row.reference,
  };
}

// ---------------------------------------------------------------------------
// Σύνολα ανά αυτοκίνητο, μήνα και εφαρμογή
// ---------------------------------------------------------------------------

export type StoredStatement = Pick<
  StatementRow,
  'driver_id' | 'platform' | 'kind' | 'year' | 'month' | 'trips' | 'turnover' | 'commission' | 'commission_vat' | 'reference'
>;

/** Μία εφαρμογή για ένα αυτοκίνητο και έναν μήνα. */
export interface PlatformMonth extends PlatformFigures {
  driverId: string;
  year: number;
  month: number;
  platform: string;
  /** Πόσες εβδομάδες έχουν καταχωρηθεί. */
  weeks: number;
  /** Το άθροισμα των κρατήσεων των εβδομάδων (για σύγκριση με το τιμολόγιο). */
  weeksCommissionCents: number;
  weeksCommissionVatCents: number;
  /** Το τιμολόγιο του μήνα, αν έχει καταχωρηθεί (τότε μετράει αυτό). */
  invoice: { commissionCents: number; vatCents: number; reference: string } | null;
}

/**
 * Ομαδοποίηση ανά αυτοκίνητο, μήνα και εφαρμογή, με τον κανόνα της βάσης
 * (προβολή `monthly_summary`): διαδρομές και τζίρος από τις εβδομάδες·
 * κράτηση από το τιμολόγιο, αλλιώς από τις εβδομάδες.
 */
export function groupStatements(rows: readonly StoredStatement[]): PlatformMonth[] {
  const groups = new Map<string, PlatformMonth>();
  for (const row of rows) {
    const key = `${row.driver_id}|${row.year}|${row.month}|${row.platform}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        driverId: row.driver_id,
        year: row.year,
        month: row.month,
        platform: row.platform,
        weeks: 0,
        trips: 0,
        turnoverCents: 0,
        weeksCommissionCents: 0,
        weeksCommissionVatCents: 0,
        invoice: null,
        commissionCents: 0,
        commissionVatCents: 0,
      };
      groups.set(key, group);
    }
    const commissionCents = toCents(Number(row.commission));
    const vatCents =
      row.commission_vat == null ? commissionVatCents(row.platform, commissionCents) : toCents(Number(row.commission_vat));
    if (row.kind === 'invoice') {
      // Ένα τιμολόγιο ανά μήνα (μοναδικό στη βάση)· αν υπήρχαν περισσότερα, αθροίζονται όπως στη βάση.
      group.invoice = {
        commissionCents: (group.invoice?.commissionCents ?? 0) + commissionCents,
        vatCents: (group.invoice?.vatCents ?? 0) + vatCents,
        reference: [group.invoice?.reference, row.reference].filter(Boolean).join(', '),
      };
    } else {
      group.weeks += 1;
      group.trips += Number(row.trips);
      group.turnoverCents += toCents(Number(row.turnover));
      group.weeksCommissionCents += commissionCents;
      group.weeksCommissionVatCents += vatCents;
    }
  }
  for (const group of groups.values()) {
    group.commissionCents = group.invoice ? group.invoice.commissionCents : group.weeksCommissionCents;
    group.commissionVatCents = group.invoice ? group.invoice.vatCents : group.weeksCommissionVatCents;
  }
  return [...groups.values()];
}

/** Σύνολα μιας εφαρμογής για όλη την περίοδο (όλα τα αυτοκίνητα και οι μήνες). */
export interface PlatformTotals extends PlatformFigures {
  platform: PlatformId;
  /** Μήνες/αυτοκίνητα με καταχωρήσεις, και πόσοι από αυτούς έχουν τιμολόγιο. */
  months: number;
  invoiced: number;
  /** Κρατήσεις των εβδομάδων: με τον τζίρο των ίδιων εβδομάδων δίνουν το ποσοστό της εφαρμογής. */
  weeksCommissionCents: number;
}

/** Τι ποσοστό του τζίρου κρατά η εφαρμογή (από τις εβδομάδες), ή null χωρίς τζίρο. */
export function commissionRatePct(figures: { weeksCommissionCents: number; turnoverCents: number }): number | null {
  return figures.turnoverCents > 0 ? (figures.weeksCommissionCents / figures.turnoverCents) * 100 : null;
}

/** Ανά εφαρμογή, με τη σειρά του `PLATFORMS` (μόνο όσες έχουν καταχωρήσεις). */
export function totalsByPlatform(months: readonly PlatformMonth[]): PlatformTotals[] {
  return PLATFORMS.map(({ id }) => {
    const list = months.filter((month) => month.platform === id);
    return {
      platform: id,
      months: list.length,
      invoiced: list.filter((month) => month.invoice).length,
      trips: list.reduce((sum, month) => sum + month.trips, 0),
      turnoverCents: list.reduce((sum, month) => sum + month.turnoverCents, 0),
      commissionCents: list.reduce((sum, month) => sum + month.commissionCents, 0),
      commissionVatCents: list.reduce((sum, month) => sum + month.commissionVatCents, 0),
      weeksCommissionCents: list.reduce((sum, month) => sum + month.weeksCommissionCents, 0),
    };
  }).filter((totals) => totals.months > 0);
}
