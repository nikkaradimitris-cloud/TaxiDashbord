/**
 * Εφαρμογές (Uber / FreeNow / Bolt): ποσοστό κράτησης, εβδομαδιαία κίνηση
 * και μηνιαίο τιμολόγιο.
 *
 * - Ποσοστό ανά αυτοκίνητο και εφαρμογή: ο οδηγός το ορίζει μία φορά, μαζί
 *   με το αν το τιμολόγιο της εφαρμογής έχει ΦΠΑ 24%, και το αλλάζει όταν
 *   χρειαστεί. Η Uber τιμολογεί πάντα χωρίς ΦΠΑ (ενδοκοινοτικό)· δεν αλλάζει.
 * - Εβδομάδα: ο οδηγός αντιγράφει το έγγραφο που στέλνει η εφαρμογή —
 *   διαδρομές, συνολικά έσοδα, προμήθεια (ο ΦΠΑ της βγαίνει μόνος του) και
 *   φιλοδωρήματα / quest (ό,τι δίνει η εφαρμογή χωρίς προμήθεια, έξω από τα
 *   έσοδα). Στη βάση: τζίρος = έσοδα + φιλοδωρήματα/quest (στήλη `tips`).
 *   Το ποσοστό × έσοδα δείχνει μόνο αν η προμήθεια είναι λογική: αν απέχει
 *   πολύ, προειδοποίηση (π.χ. γράφτηκε άλλη γραμμή του εγγράφου).
 *   Κάθε καταχώρηση κρατά το ποσοστό και τον ΦΠΑ με τα οποία έγινε.
 * - Εβδομάδα = Δευτέρα–Κυριακή, κομμένη στην αλλαγή του μήνα (ίδιος κανόνας
 *   με τη βάση): ο Οκτώβριος 2026 ξεκινά Πέμπτη → 1–4, 5–11, …, 26–31 Οκτ.
 * - Οι κούρσες των εφαρμογών είναι μέσα στο Ζ: διαδρομές από τον δρόμο =
 *   διαδρομές Ζ − διαδρομές εφαρμογών.
 * - Κράτηση του μήνα: το τιμολόγιο όταν υπάρχει, αλλιώς το άθροισμα των
 *   εβδομάδων. Ο ΦΠΑ 24% συμψηφίζεται· χωρίς ΦΠΑ δεν συμψηφίζεται.
 */
import { includedExpenseVatCents, round2, toCents, type PlatformFigures } from './accounting';
import { parseDecimal, parseOptionalDecimal, parseOptionalInteger } from './numbers';
import { periodLabel } from './period';
import type { PlatformRateInsert, PlatformRateRow, StatementInsert, StatementRow } from './types';

export const PLATFORMS = [
  { id: 'uber', label: 'Uber' },
  { id: 'freenow', label: 'FreeNow' },
  { id: 'bolt', label: 'Bolt' },
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

// ---------------------------------------------------------------------------
// Ποσοστό κράτησης και ΦΠΑ
// ---------------------------------------------------------------------------

/** ΦΠΑ του τιμολογίου της εφαρμογής: 24% ή 0 (ενδοκοινοτικό, χωρίς ΦΠΑ). */
export type VatRate = 0 | 24;

export function toVatRate(value: unknown): VatRate {
  return Number(value) === 24 ? 24 : 0;
}

/** Η Uber τιμολογεί πάντα χωρίς ΦΠΑ: δεν επιλέγεται (προστασία από λάθη). */
export function fixedVatRate(platform: string): VatRate | null {
  return platform === 'uber' ? 0 : null;
}

/** Προεπιλογή στη ρύθμιση: FreeNow με ΦΠΑ 24%· στη Bolt το διαλέγει ο οδηγός. */
export function defaultVatRate(platform: string): VatRate | null {
  if (platform === 'uber') return 0;
  if (platform === 'freenow') return 24;
  return null;
}

/** ΦΠΑ μέσα στην κράτηση, σε λεπτά: με ΦΠΑ 24% εμπεριεχόμενος, αλλιώς 0. */
export function commissionVatCents(vatRate: number, commissionCents: number): number {
  return vatRate === 24 ? includedExpenseVatCents(commissionCents) : 0;
}

/** Η ρύθμιση κράτησης μιας εφαρμογής για ένα αυτοκίνητο. */
export interface PlatformRate {
  /** Π.χ. 15 = 15% του τζίρου χωρίς τα φιλοδωρήματα. */
  ratePct: number;
  vatRate: VatRate;
}

export function rateFromRow(row: Pick<PlatformRateRow, 'rate_pct' | 'vat_rate'>): PlatformRate {
  return { ratePct: Number(row.rate_pct), vatRate: toVatRate(row.vat_rate) };
}

/** Η ρύθμιση ενός αυτοκινήτου για μια εφαρμογή, αν έχει οριστεί. */
export function findRate(
  rows: readonly Pick<PlatformRateRow, 'driver_id' | 'platform' | 'rate_pct' | 'vat_rate'>[],
  driverId: string | null | undefined,
  platform: string,
): PlatformRate | null {
  const row = rows.find((r) => r.driver_id === driverId && r.platform === platform);
  return row ? rateFromRow(row) : null;
}

/** «Δουλεύει με»: 'on' (με ποσοστό), 'off' (με ποσοστό, αλλά «εκτός») ή 'unset' (χωρίς ποσοστό ακόμη). */
export type PlatformUse = 'on' | 'off' | 'unset';

export function platformUse(
  rows: readonly Pick<PlatformRateRow, 'driver_id' | 'platform' | 'active'>[],
  driverId: string | null | undefined,
  platform: string,
): PlatformUse {
  const row = rows.find((r) => r.driver_id === driverId && r.platform === platform);
  return !row ? 'unset' : row.active === false ? 'off' : 'on';
}

/**
 * Οι εφαρμογές που δουλεύει ένα αυτοκίνητο σε έναν μήνα (για τις εβδομάδες που λείπουν): όσες έχουν
 * ποσοστό, ή δεν έχουν ποσοστό αλλά έχουν καταχωρήσεις στον μήνα. Όσες είναι «εκτός» δεν ζητούνται ποτέ.
 */
export function workedPlatforms(
  rates: readonly Pick<PlatformRateRow, 'driver_id' | 'platform' | 'active'>[],
  statements: readonly Pick<StatementRow, 'driver_id' | 'month' | 'platform'>[],
  carId: string,
  month: number,
): PlatformId[] {
  return PLATFORMS.map((platform) => platform.id).filter((id) => {
    const use = platformUse(rates, carId, id);
    if (use === 'off') return false;
    return use === 'on' || statements.some((row) => row.driver_id === carId && row.month === month && row.platform === id);
  });
}

/** Οι εφαρμογές της φόρμας για ένα αυτοκίνητο: όλες εκτός από όσες είναι «εκτός» (αν είναι όλες «εκτός», όλες). */
export function formPlatforms(
  rates: readonly Pick<PlatformRateRow, 'driver_id' | 'platform' | 'active'>[],
  carId: string | null | undefined,
): (typeof PLATFORMS)[number][] {
  const allowed = PLATFORMS.filter((platform) => platformUse(rates, carId, platform.id) !== 'off');
  return allowed.length > 0 ? allowed : [...PLATFORMS];
}

const percent = new Intl.NumberFormat('el-GR', { maximumFractionDigits: 2 });

/** «15% + ΦΠΑ 24%» ή «12% χωρίς ΦΠΑ» */
export function rateLabel(rate: PlatformRate): string {
  return `${percent.format(rate.ratePct)}%${rate.vatRate === 24 ? ' + ΦΠΑ 24%' : ' χωρίς ΦΠΑ'}`;
}

/** Ο υπολογισμός της κράτησης μιας εβδομάδας από το ποσοστό. */
export interface CommissionBreakdown {
  /** Τζίρος χωρίς τα φιλοδωρήματα: πάνω σε αυτόν μετράει το ποσοστό. */
  baseCents: number;
  /** Κράτηση χωρίς ΦΠΑ = ποσοστό × βάση. */
  netCents: number;
  /** ΦΠΑ 24% πάνω στην κράτηση (0 χωρίς ΦΠΑ). */
  vatCents: number;
  /** Το τελικό ποσό (με ΦΠΑ όπου υπάρχει): αυτό καταχωρείται. */
  totalCents: number;
}

/**
 * Κράτηση = ποσοστό × (τζίρος − φιλοδωρήματα), + ΦΠΑ 24% όπου υπάρχει.
 * Π.χ. FreeNow 15% + ΦΠΑ, τζίρος 150 €, φιλοδωρήματα 10 €:
 * 15% × 140 = 21,00 € + ΦΠΑ 5,04 € = 26,04 €.
 */
export function computeCommission(turnoverCents: number, tipsCents: number, rate: PlatformRate): CommissionBreakdown {
  const baseCents = Math.max(0, turnoverCents - tipsCents);
  // Ακέραια αριθμητική (ποσοστό σε εκατοστά του %)· θετικά ποσά: το μισό λεπτό στρογγυλεύει προς τα πάνω.
  const netCents = Math.round((baseCents * Math.round(rate.ratePct * 100)) / 10_000);
  const vatCents = rate.vatRate === 24 ? Math.round((netCents * 24) / 100) : 0;
  return { baseCents, netCents, vatCents, totalCents: netCents + vatCents };
}

/** Οι τιμές της ρύθμισης όπως τις πληκτρολογεί ο χρήστης ('' = δεν έχει διαλέξει ΦΠΑ). */
export interface RateFormValues {
  rate: string;
  vat: '24' | '0' | '';
}

export function rateToFormValues(rate: PlatformRate | null, platform: string): RateFormValues {
  if (rate) return { rate: decimalText(rate.ratePct), vat: rate.vatRate === 24 ? '24' : '0' };
  const vat = defaultVatRate(platform);
  return { rate: '', vat: vat === null ? '' : vat === 24 ? '24' : '0' };
}

export function parseRateForm(
  values: RateFormValues,
  platform: string,
): { rate: PlatformRate | null; errors: { rate?: string; vat?: string } } {
  const errors: { rate?: string; vat?: string } = {};
  const pct = parseDecimal(values.rate);
  if (!values.rate.trim()) errors.rate = 'Γράψτε το ποσοστό (π.χ. 15).';
  else if (pct === null) errors.rate = 'Μη έγκυρος αριθμός (π.χ. 12,5).';
  else if (round2(pct) <= 0 || pct > 100) errors.rate = 'Ποσοστό μεγαλύτερο από 0 και έως 100.';

  const vat = fixedVatRate(platform) ?? (values.vat === '24' ? 24 : values.vat === '0' ? 0 : null);
  if (vat === null) errors.vat = 'Διαλέξτε αν το τιμολόγιο της εφαρμογής έχει ΦΠΑ.';

  const valid = Object.keys(errors).length === 0;
  return { rate: valid ? { ratePct: round2(pct!), vatRate: vat! } : null, errors };
}

/** Η ρύθμιση για τη βάση (η Uber πάντα χωρίς ΦΠΑ). */
export function toRateValues(rate: PlatformRate, meta: { driverId: string; platform: PlatformId }): PlatformRateInsert {
  return {
    driver_id: meta.driverId,
    platform: meta.platform,
    rate_pct: round2(rate.ratePct),
    vat_rate: fixedVatRate(meta.platform) ?? rate.vatRate,
  };
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
// Φόρμα καταχώρησης
// ---------------------------------------------------------------------------

/** Οι τιμές της φόρμας όπως τις πληκτρολογεί ο χρήστης. */
export interface StatementFormValues {
  platform: PlatformId;
  kind: StatementKind;
  /** Η αρχή της εβδομάδας ('YYYY-MM-DD'), μόνο για εβδομάδα. */
  weekStart: string;
  trips: string;
  /** Εβδομάδα: τα «Συνολικά Έσοδα» του εγγράφου. */
  revenue: string;
  /** Εβδομάδα: φιλοδωρήματα / quest — ό,τι δίνει η εφαρμογή χωρίς προμήθεια, έξω από τα έσοδα (κενό = 0). */
  tips: string;
  /** Εβδομάδα: η προμήθεια του εγγράφου · Τιμολόγιο: το ποσό του τιμολογίου. */
  commission: string;
  /** Αριθμός τιμολογίου (προαιρετικά). */
  reference: string;
}

export const EMPTY_STATEMENT_FORM: StatementFormValues = {
  platform: 'uber',
  kind: 'week',
  weekStart: '',
  trips: '',
  revenue: '',
  tips: '',
  commission: '',
  reference: '',
};

export type StatementFormErrors = Partial<Record<keyof StatementFormValues | 'rate', string>>;

export interface StatementInput {
  platform: PlatformId;
  kind: StatementKind;
  weekStart: string | null;
  trips: number;
  /** Τζίρος = συνολικά έσοδα + φιλοδωρήματα/quest. */
  turnover: number;
  /** Φιλοδωρήματα / quest (χωρίς προμήθεια). */
  tips: number;
  /** Το τελικό ποσό της προμήθειας (με ΦΠΑ όπου υπάρχει). */
  commission: number;
  reference: string;
  /** Το ποσοστό της εβδομάδας (null για τιμολόγιο). */
  ratePct: number | null;
  vatRate: VatRate;
}

/** Η ρύθμιση που ισχύει για την καταχώρηση: για τιμολόγιο αρκεί ο ΦΠΑ. */
export interface EntryRate {
  ratePct: number | null;
  vatRate: VatRate;
}

export interface ParsedStatementForm {
  /** null όταν υπάρχουν σφάλματα. */
  input: StatementInput | null;
  errors: StatementFormErrors;
  /** Ζωντανή προεπισκόπηση (άκυρα ποσά → 0). */
  preview: {
    commissionCents: number;
    vatCents: number;
    /** Εβδομάδα: η προμήθεια που δίνει το ποσοστό πάνω στα έσοδα (για έλεγχο). */
    expected: CommissionBreakdown | null;
    /** Η προμήθεια απέχει πολύ από το ποσοστό: μάλλον γράφτηκε άλλη γραμμή του εγγράφου. */
    unusual: boolean;
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

/**
 * Η προμήθεια του εγγράφου απέχει πολύ από όση δίνει το ποσοστό πάνω στα
 * έσοδα; Λίγο κάτω είναι φυσικό (τα φιλοδωρήματα μέσα στα έσοδα δεν έχουν
 * προμήθεια)· πολύ πάνω ή πολύ κάτω σημαίνει συνήθως άλλη γραμμή του εγγράφου.
 */
export function isUnusualCommission(commissionCents: number, expected: CommissionBreakdown | null): boolean {
  if (!expected || expected.totalCents === 0) return false;
  return commissionCents > expected.totalCents * 1.05 + 5 || commissionCents < expected.totalCents * 0.7;
}

export function parseStatementForm(
  values: StatementFormValues,
  period: { year: number; month: number },
  rate: EntryRate | null,
): ParsedStatementForm {
  const errors: StatementFormErrors = {};
  const isWeek = values.kind === 'week';

  if (!isPlatform(values.platform)) errors.platform = 'Επιλέξτε εφαρμογή.';
  if (values.kind !== 'week' && values.kind !== 'invoice') errors.kind = 'Επιλέξτε τι καταχωρείτε.';
  if (!rate || (isWeek && rate.ratePct === null)) errors.rate = 'Ορίστε πρώτα το ποσοστό της εφαρμογής.';

  let weekStart: string | null = null;
  let trips = 0;
  let revenue = 0;
  let tips = 0;
  let expected: CommissionBreakdown | null = null;
  let commissionCents = 0;

  if (isWeek) {
    weekStart = weekCycles(period.year, period.month).find((week) => week.start === values.weekStart)?.start ?? null;
    if (!weekStart) errors.weekStart = 'Επιλέξτε εβδομάδα.';

    const parsedTrips = parseOptionalInteger(values.trips);
    if (!values.trips.trim()) errors.trips = 'Γράψτε τις διαδρομές (ή 0).';
    else if (parsedTrips === null || parsedTrips > MAX_TRIPS) errors.trips = 'Ακέραιος αριθμός (π.χ. 12).';
    else trips = parsedTrips;

    const parsedRevenue = parseAmount(values.revenue, 'Γράψτε τα συνολικά έσοδα (ή 0).');
    if (parsedRevenue.error) errors.revenue = parsedRevenue.error;
    else revenue = parsedRevenue.value!;

    const parsedCommission = parseAmount(values.commission, 'Γράψτε την προμήθεια όπως στο έγγραφο (ή 0).');
    if (parsedCommission.error) errors.commission = parsedCommission.error;
    else if (!errors.revenue && parsedCommission.value! > revenue) {
      errors.commission = 'Η προμήθεια δεν μπορεί να είναι μεγαλύτερη από τα έσοδα.';
    }
    commissionCents = toCents(parsedCommission.value ?? 0);

    const parsedTips = parseOptionalDecimal(values.tips);
    if (parsedTips === null) errors.tips = 'Μη έγκυρος αριθμός (π.χ. 45,00).';
    else if (parsedTips >= MAX_AMOUNT) errors.tips = 'Μη ρεαλιστική τιμή.';
    else tips = round2(parsedTips);

    if (rate && rate.ratePct !== null) {
      expected = computeCommission(toCents(revenue), 0, { ratePct: rate.ratePct, vatRate: rate.vatRate });
    }
  } else {
    const amount = parseAmount(values.commission, 'Γράψτε το ποσό του τιμολογίου.');
    if (amount.error) errors.commission = amount.error;
    else if (amount.value! <= 0) errors.commission = 'Το ποσό πρέπει να είναι μεγαλύτερο από 0.';
    commissionCents = toCents(amount.value ?? 0);
  }

  const reference = isWeek ? '' : values.reference.trim();
  if (reference.length > MAX_REFERENCE) errors.reference = `Έως ${MAX_REFERENCE} χαρακτήρες.`;

  // Ο ΦΠΑ μέσα στην προμήθεια / στο τιμολόγιο (όπως τον υπολογίζει και η βάση).
  const vatCents = commissionVatCents(rate?.vatRate ?? 0, commissionCents);
  const unusual = isWeek && !errors.revenue && !errors.commission && isUnusualCommission(commissionCents, expected);

  const valid = Object.keys(errors).length === 0;
  return {
    input: valid
      ? {
          platform: values.platform,
          kind: values.kind,
          weekStart,
          trips,
          turnover: isWeek ? round2(revenue + tips) : 0,
          tips,
          commission: commissionCents / 100,
          reference,
          ratePct: isWeek ? rate!.ratePct : null,
          vatRate: rate!.vatRate,
        }
      : null,
    errors,
    preview: { commissionCents, vatCents, expected, unusual },
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
    tips: isWeek ? round2(input.tips) : 0,
    rate_pct: isWeek ? input.ratePct : null,
    vat_rate: fixedVatRate(input.platform) ?? input.vatRate,
    commission: round2(input.commission),
    reference: isWeek ? '' : input.reference,
  };
}

function decimalText(value: number): string {
  return String(round2(Number(value))).replace('.', ',');
}

/** Εβδομάδα: τα «Συνολικά Έσοδα» του εγγράφου = τζίρος − φιλοδωρήματα/quest. */
export function statementRevenueCents(row: Pick<StatementRow, 'turnover' | 'tips'>): number {
  return toCents(Number(row.turnover)) - toCents(Number(row.tips));
}

/** Αποθηκευμένη καταχώρηση → τιμές φόρμας, για διόρθωση (ελληνική υποδιαστολή). */
export function statementToFormValues(
  row: Pick<StatementRow, 'platform' | 'kind' | 'week_start' | 'trips' | 'turnover' | 'tips' | 'commission' | 'reference'>,
): StatementFormValues {
  const isWeek = row.kind !== 'invoice';
  return {
    platform: isPlatform(row.platform) ? row.platform : 'uber',
    kind: isWeek ? 'week' : 'invoice',
    weekStart: row.week_start ?? '',
    trips: isWeek ? String(row.trips) : '',
    revenue: isWeek ? decimalText(statementRevenueCents(row) / 100) : '',
    tips: isWeek && Number(row.tips) > 0 ? decimalText(row.tips) : '',
    commission: decimalText(row.commission),
    reference: row.reference,
  };
}

// ---------------------------------------------------------------------------
// Σύνολα ανά αυτοκίνητο, μήνα και εφαρμογή
// ---------------------------------------------------------------------------

export type StoredStatement = Pick<
  StatementRow,
  | 'driver_id'
  | 'platform'
  | 'kind'
  | 'year'
  | 'month'
  | 'trips'
  | 'turnover'
  | 'tips'
  | 'vat_rate'
  | 'commission'
  | 'commission_vat'
  | 'reference'
>;

interface CommissionSum {
  commissionCents: number;
  vatCents: number;
  /** Κρατήσεις χωρίς ΦΠΑ (ενδοκοινοτικά τιμολόγια): δεν συμψηφίζονται. */
  noVatCents: number;
}

/**
 * Μία εφαρμογή για ένα αυτοκίνητο και έναν μήνα. Το `turnoverCents` είναι τα
 * έσοδα των διαδρομών (τα «Συνολικά Έσοδα» των εγγράφων), που είναι μέσα στα
 * Ζ· τα φιλοδωρήματα / quest είναι χωριστά (`tipsCents`).
 */
export interface PlatformMonth extends PlatformFigures {
  driverId: string;
  year: number;
  month: number;
  platform: string;
  /** Πόσες εβδομάδες έχουν καταχωρηθεί. */
  weeks: number;
  /** Φιλοδωρήματα / quest των εβδομάδων (χωρίς προμήθεια, έξω από τα έσοδα). */
  tipsCents: number;
  /** Το άθροισμα των κρατήσεων των εβδομάδων (για σύγκριση με το τιμολόγιο). */
  weeksCommissionCents: number;
  weeksCommissionVatCents: number;
  /** Το τιμολόγιο του μήνα, αν έχει καταχωρηθεί (τότε μετράει αυτό). */
  invoice: (CommissionSum & { reference: string }) | null;
  /** Όση από την κράτηση που μετράει δεν έχει ΦΠΑ (δεν συμψηφίζεται). */
  commissionNoVatCents: number;
}

/**
 * Ομαδοποίηση ανά αυτοκίνητο, μήνα και εφαρμογή. Διαδρομές, έσοδα και
 * φιλοδωρήματα/quest από τις εβδομάδες· κράτηση από το τιμολόγιο, αλλιώς από
 * τις εβδομάδες (ο κανόνας της προβολής `monthly_summary` της βάσης).
 */
export function groupStatements(rows: readonly StoredStatement[]): PlatformMonth[] {
  const groups = new Map<string, PlatformMonth & { weeksNoVatCents: number }>();
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
        tipsCents: 0,
        weeksCommissionCents: 0,
        weeksCommissionVatCents: 0,
        weeksNoVatCents: 0,
        invoice: null,
        commissionCents: 0,
        commissionVatCents: 0,
        commissionNoVatCents: 0,
      };
      groups.set(key, group);
    }
    const commissionCents = toCents(Number(row.commission));
    const vatCents =
      row.commission_vat == null ? commissionVatCents(row.vat_rate, commissionCents) : toCents(Number(row.commission_vat));
    const noVatCents = toVatRate(row.vat_rate) === 0 ? commissionCents : 0;
    if (row.kind === 'invoice') {
      // Ένα τιμολόγιο ανά μήνα (μοναδικό στη βάση)· αν υπήρχαν περισσότερα, αθροίζονται όπως στη βάση.
      group.invoice = {
        commissionCents: (group.invoice?.commissionCents ?? 0) + commissionCents,
        vatCents: (group.invoice?.vatCents ?? 0) + vatCents,
        noVatCents: (group.invoice?.noVatCents ?? 0) + noVatCents,
        reference: [group.invoice?.reference, row.reference].filter(Boolean).join(', '),
      };
    } else {
      group.weeks += 1;
      group.trips += Number(row.trips);
      group.turnoverCents += statementRevenueCents(row);
      group.tipsCents += toCents(Number(row.tips));
      group.weeksCommissionCents += commissionCents;
      group.weeksCommissionVatCents += vatCents;
      group.weeksNoVatCents += noVatCents;
    }
  }
  return [...groups.values()].map(({ weeksNoVatCents, ...group }) => ({
    ...group,
    commissionCents: group.invoice ? group.invoice.commissionCents : group.weeksCommissionCents,
    commissionVatCents: group.invoice ? group.invoice.vatCents : group.weeksCommissionVatCents,
    commissionNoVatCents: group.invoice ? group.invoice.noVatCents : weeksNoVatCents,
  }));
}

/** Σύνολα μιας εφαρμογής για όλη την περίοδο (όλα τα αυτοκίνητα και οι μήνες). */
export interface PlatformTotals extends PlatformFigures {
  platform: PlatformId;
  /** Μήνες/αυτοκίνητα με καταχωρήσεις, και πόσοι από αυτούς έχουν τιμολόγιο. */
  months: number;
  invoiced: number;
  tipsCents: number;
  commissionNoVatCents: number;
}

/** Ανά εφαρμογή, με τη σειρά του `PLATFORMS` (μόνο όσες έχουν καταχωρήσεις). */
export function totalsByPlatform(months: readonly PlatformMonth[]): PlatformTotals[] {
  return PLATFORMS.map(({ id }) => {
    const list = months.filter((month) => month.platform === id);
    const sum = (pick: (month: PlatformMonth) => number) => list.reduce((total, month) => total + pick(month), 0);
    return {
      platform: id,
      months: list.length,
      invoiced: list.filter((month) => month.invoice).length,
      trips: sum((month) => month.trips),
      turnoverCents: sum((month) => month.turnoverCents),
      tipsCents: sum((month) => month.tipsCents),
      commissionCents: sum((month) => month.commissionCents),
      commissionVatCents: sum((month) => month.commissionVatCents),
      commissionNoVatCents: sum((month) => month.commissionNoVatCents),
    };
  }).filter((totals) => totals.months > 0);
}
