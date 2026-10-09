/**
 * Πίνακας της κάρτας «Αναλυτικά»: Τζίρος, Διαδρομές και Μέση αξία διαδρομής,
 * με μία γραμμή ανά βάρδια ή ανά μήνα του έτους.
 *
 *   Τζίρος               = μικτή είσπραξη (καθαρά + ΦΠΑ 13% + φιλοδωρήματα)
 *   Μέση αξία διαδρομής  = (καθαρά + ΦΠΑ 13%) ÷ διαδρομές — χωρίς φιλοδωρήματα
 */
import { toCents, type ShiftFigures } from './accounting';
import { driverRanks, type ChartDriver, type ChartShift } from './chart';
import { monthName, type MonthFilter } from './period';

/** Τα τρία μεγέθη του πίνακα για μία ή περισσότερες βάρδιες. */
export interface TableTotals {
  shifts: number;
  grossCents: number;
  trips: number;
  /** Καθαρά + ΦΠΑ 13%, χωρίς φιλοδωρήματα. */
  fareCents: number;
}

export function emptyTotals(): TableTotals {
  return { shifts: 0, grossCents: 0, trips: 0, fareCents: 0 };
}

type Figures = Pick<ShiftFigures, 'grossReceiptsCents' | 'trips' | 'netRevenueCents' | 'vatCents'>;

export function sumFigures(list: readonly Figures[]): TableTotals {
  const totals = emptyTotals();
  for (const figures of list) {
    totals.shifts += 1;
    totals.grossCents += figures.grossReceiptsCents;
    totals.trips += figures.trips;
    totals.fareCents += figures.netRevenueCents + figures.vatCents;
  }
  return totals;
}

function addTotals(a: TableTotals, b: TableTotals): TableTotals {
  return {
    shifts: a.shifts + b.shifts,
    grossCents: a.grossCents + b.grossCents,
    trips: a.trips + b.trips,
    fareCents: a.fareCents + b.fareCents,
  };
}

/** Μέση αξία διαδρομής σε λεπτά (null χωρίς διαδρομές). */
export function averageTripCents(totals: TableTotals): number | null {
  return totals.trips > 0 ? totals.fareCents / totals.trips : null;
}

// ---------------------------------------------------------------------------
// Ανά βάρδια
// ---------------------------------------------------------------------------

export type ShiftTableEntry =
  | { kind: 'group'; key: string; label: string; shifts: number }
  | { kind: 'shift'; key: string; zNumber: string; totals: TableTotals };

const zCollator = new Intl.Collator('el', { numeric: true, sensitivity: 'base' });

/**
 * Η σειρά των βαρδιών σε πίνακες και λίστες: μήνας, οδηγός (σειρά στόλου) και αριθμός Ζ (ως αριθμός), και
 * για ίδιο Ζ η σειρά καταχώρησης. Έτσι το Ζ 911 είναι πάντα δίπλα στο 912, όποτε κι αν γράφτηκε.
 * `desc`: τα νεότερα πρώτα (μήνας και Ζ από το μεγαλύτερο), οι οδηγοί πάλι με τη σειρά του στόλου.
 */
export function sortShifts<T extends { row: ChartShift['row'] }>(
  items: readonly T[],
  drivers: readonly ChartDriver[],
  order: 'asc' | 'desc' = 'asc',
): T[] {
  const ranks = driverRanks(drivers, new Set(items.map((item) => item.row.driver_id)));
  const sign = order === 'asc' ? 1 : -1;
  return [...items].sort(
    (a, b) =>
      sign * (a.row.month - b.row.month) ||
      ranks.get(a.row.driver_id)! - ranks.get(b.row.driver_id)! ||
      sign *
        (zCollator.compare(a.row.z_number, b.row.z_number) ||
          a.row.created_at.localeCompare(b.row.created_at) ||
          a.row.id.localeCompare(b.row.id)),
  );
}

/**
 * Μία γραμμή ανά βάρδια: κατά μήνα, οδηγό (σειρά στόλου) και αριθμό Ζ.
 * Με «Όλοι οι μήνες» ή πολλούς οδηγούς οι βάρδιες χωρίζονται με επικεφαλίδες
 * (π.χ. «Σεπτέμβριος · Γιώργος»), ώστε κάθε γραμμή να δείχνει μόνο τον αριθμό Ζ.
 */
export function buildShiftTable(
  items: readonly ChartShift[],
  options: { month: MonthFilter; drivers: readonly ChartDriver[] },
): { entries: ShiftTableEntry[]; total: TableTotals } {
  const driverIds = new Set(items.map((item) => item.row.driver_id));
  const names = new Map(options.drivers.map((driver) => [driver.id, driver.name]));
  const byMonth = options.month === 'all';
  const byDriver = driverIds.size > 1;

  const sorted = sortShifts(items, options.drivers);

  const entries: ShiftTableEntry[] = [];
  let group = undefined as Extract<ShiftTableEntry, { kind: 'group' }> | undefined;
  for (const item of sorted) {
    if (byMonth || byDriver) {
      const key = `${item.row.month}|${item.row.driver_id}`;
      if (!group || group.key !== key) {
        const parts = [
          byMonth ? monthName(item.row.month) : null,
          byDriver ? (names.get(item.row.driver_id) ?? '—') : null,
        ];
        group = { kind: 'group', key, label: parts.filter(Boolean).join(' · '), shifts: 0 };
        entries.push(group);
      }
      group.shifts += 1;
    }
    entries.push({ kind: 'shift', key: item.row.id, zNumber: item.row.z_number, totals: sumFigures([item.figures]) });
  }

  return { entries, total: sumFigures(items.map((item) => item.figures)) };
}

// ---------------------------------------------------------------------------
// Ανά μήνα
// ---------------------------------------------------------------------------

export interface MonthTableRow {
  month: number;
  totals: TableTotals;
}

/** Γραμμές μηνών (μόνο όσοι έχουν βάρδιες) από τις βάρδιες που έχουν φορτωθεί. */
export function monthRowsFromShifts(items: readonly ChartShift[]): MonthTableRow[] {
  const byMonth = new Map<number, Figures[]>();
  for (const item of items) {
    const list = byMonth.get(item.row.month) ?? [];
    list.push(item.figures);
    byMonth.set(item.row.month, list);
  }
  return [...byMonth.entries()]
    .map(([month, list]) => ({ month, totals: sumFigures(list) }))
    .sort((a, b) => a.month - b.month);
}

/** Γραμμή της προβολής `monthly_summary` (σύνολα ανά οδηγό και μήνα, από τη βάση). */
export interface MonthSummaryRow {
  month: number | null;
  shifts: number | null;
  trips: number | null;
  net_revenue: number | null;
  vat: number | null;
  gross_receipts: number | null;
}

/**
 * Γραμμές μηνών του έτους από τα σύνολα της βάσης (όλοι οι οδηγοί μαζί).
 * Ο μήνας που είναι ανοιχτός στη σελίδα υπολογίζεται από τις βάρδιες που
 * φαίνονται (`live`), ώστε μια νέα καταχώρηση/διόρθωση να φαίνεται αμέσως.
 */
export function monthRowsFromSummary(
  summary: readonly MonthSummaryRow[],
  live?: { month: number; items: readonly ChartShift[] },
): MonthTableRow[] {
  const byMonth = new Map<number, TableTotals>();
  for (const row of summary) {
    if (row.month == null || live?.month === row.month) continue;
    const totals: TableTotals = {
      shifts: Number(row.shifts ?? 0),
      grossCents: toCents(Number(row.gross_receipts ?? 0)),
      trips: Number(row.trips ?? 0),
      fareCents: toCents(Number(row.net_revenue ?? 0)) + toCents(Number(row.vat ?? 0)),
    };
    byMonth.set(row.month, addTotals(byMonth.get(row.month) ?? emptyTotals(), totals));
  }
  if (live && live.items.length > 0) byMonth.set(live.month, sumFigures(live.items.map((item) => item.figures)));

  return [...byMonth.entries()]
    .filter(([, totals]) => totals.shifts > 0)
    .map(([month, totals]) => ({ month, totals }))
    .sort((a, b) => a.month - b.month);
}

export function sumRows(rows: readonly { totals: TableTotals }[]): TableTotals {
  return rows.reduce((sum, row) => addTotals(sum, row.totals), emptyTotals());
}
