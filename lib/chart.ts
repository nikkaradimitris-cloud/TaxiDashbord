/**
 * Δεδομένα για το γράφημα του dashboard.
 *
 *  - Συγκεκριμένος μήνας → ένα σημείο ανά βάρδια, με σειρά αριθμού Ζ.
 *  - Όλοι οι μήνες      → ένα σημείο ανά μήνα του έτους (Ιαν–Δεκ).
 *  - Πολλοί οδηγοί      → μία γραμμή ανά οδηγό, με σταθερό χρώμα ανά οδηγό.
 *
 * Μεγέθη:
 *   Τζίρος               = μικτή είσπραξη (καθαρά + ΦΠΑ 13% + φιλοδωρήματα)
 *   Διαδρομές            = πλήθος διαδρομών
 *   Μέση αξία διαδρομής  = (καθαρά + ΦΠΑ 13%) ÷ διαδρομές — χωρίς φιλοδωρήματα
 */
import type { ShiftFigures } from './accounting';
import { monthName, type MonthFilter } from './period';

export type ChartMetric = 'gross' | 'trips' | 'avgTrip';

export const CHART_METRICS: readonly { id: ChartMetric; label: string }[] = [
  { id: 'gross', label: 'Τζίρος' },
  { id: 'trips', label: 'Διαδρομές' },
  { id: 'avgTrip', label: 'Μέση αξία διαδρομής' },
];

export function isChartMetric(value: unknown): value is ChartMetric {
  return value === 'gross' || value === 'trips' || value === 'avgTrip';
}

/** Πλήθος χρωμάτων γραμμών (--chart-1 … --chart-8 στο globals.css). */
export const SERIES_COLORS = 8;
/** Το πολύ τόσες γραμμές οδηγών σε ένα γράφημα· οι υπόλοιποι μέσω του φίλτρου οδηγού. */
export const MAX_SERIES = 6;

export const SHORT_MONTHS = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαΐ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ'] as const;

export interface ChartShift {
  row: { id: string; driver_id: string; z_number: string; month: number; created_at: string };
  figures: Pick<ShiftFigures, 'grossReceiptsCents' | 'trips' | 'netRevenueCents' | 'vatCents'>;
}

export interface ChartDriver {
  id: string;
  name: string;
  created_at: string;
}

/** Τα ποσά ενός σημείου (μίας βάρδιας ή ενός μήνα). */
export interface ChartPoint {
  /** Η τιμή του μεγέθους (λεπτά ή πλήθος)· null = χωρίς δεδομένα (κενό στη γραμμή). */
  value: number | null;
  shifts: number;
  grossCents: number;
  trips: number;
  /** Καθαρά + ΦΠΑ 13%, χωρίς φιλοδωρήματα. */
  fareCents: number;
  /** Αριθμός Ζ, όταν το σημείο είναι μία βάρδια. */
  zNumber: string | null;
}

export interface ChartSeries {
  driverId: string;
  name: string;
  /** Θέση χρώματος 0…7 — σταθερή ανά οδηγό (σειρά καταχώρησης στον στόλο) — ή null για γκρι. */
  color: number | null;
  /** Ένα σημείο για κάθε θέση του άξονα Χ. */
  points: ChartPoint[];
}

export interface ChartData {
  mode: 'shifts' | 'months';
  metric: ChartMetric;
  /** Σύντομες ετικέτες του άξονα Χ. */
  xLabels: string[];
  /** Πλήρεις τίτλοι κάθε θέσης (tooltip, πίνακας). */
  xTitles: string[];
  series: ChartSeries[];
  /** Οδηγοί με δεδομένα που δεν χωράνε στο γράφημα (πάνω από MAX_SERIES). */
  hiddenDrivers: number;
  /** Γραμμή αναφοράς: μέσος όρος ανά σημείο (ή μέση αξία διαδρομής της περιόδου). */
  average: number | null;
  averageLabel: string;
  /** Μεγαλύτερη τιμή που σχεδιάζεται (και ο μέσος όρος), 0 αν δεν υπάρχει. */
  maxValue: number;
}

const zCollator = new Intl.Collator('el', { numeric: true, sensitivity: 'base' });

function compareShifts(a: ChartShift, b: ChartShift): number {
  return (
    zCollator.compare(a.row.z_number, b.row.z_number) ||
    a.row.created_at.localeCompare(b.row.created_at) ||
    a.row.id.localeCompare(b.row.id)
  );
}

function emptyPoint(): ChartPoint {
  return { value: null, shifts: 0, grossCents: 0, trips: 0, fareCents: 0, zNumber: null };
}

function addShift(point: ChartPoint, shift: ChartShift): void {
  point.shifts += 1;
  point.grossCents += shift.figures.grossReceiptsCents;
  point.trips += shift.figures.trips;
  point.fareCents += shift.figures.netRevenueCents + shift.figures.vatCents;
}

function metricValue(metric: ChartMetric, point: Omit<ChartPoint, 'value' | 'zNumber'>): number | null {
  if (point.shifts === 0) return null;
  if (metric === 'gross') return point.grossCents;
  if (metric === 'trips') return point.trips;
  return point.trips > 0 ? point.fareCents / point.trips : null;
}

/**
 * Σταθερή σειρά οδηγών (χρώματα γραφήματος, σειρά στον πίνακα): με τη σειρά
 * που μπήκαν στον στόλο.
 */
export function driverRanks(drivers: readonly ChartDriver[], driverIds: Iterable<string>): Map<string, number> {
  const known = [...drivers].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  const ranks = new Map(known.map((driver, index) => [driver.id, index]));
  // Οδηγοί που δεν έχουν φορτωθεί ακόμη: μετά τους γνωστούς.
  for (const id of [...driverIds].filter((id) => !ranks.has(id)).sort()) ranks.set(id, ranks.size);
  return ranks;
}

export function buildChartData(
  items: readonly ChartShift[],
  options: { metric: ChartMetric; year: number; month: MonthFilter; drivers: readonly ChartDriver[] },
): ChartData {
  const { metric, year, month, drivers } = options;
  const mode = month === 'all' ? 'months' : 'shifts';

  const groups = new Map<string, ChartShift[]>();
  for (const item of items) {
    const list = groups.get(item.row.driver_id) ?? [];
    list.push(item);
    groups.set(item.row.driver_id, list);
  }
  const ranks = driverRanks(drivers, groups.keys());
  const names = new Map(drivers.map((driver) => [driver.id, driver.name]));

  // Πάνω από MAX_SERIES οδηγούς: κρατάμε όσους έχουν τον μεγαλύτερο τζίρο.
  const grossOf = (list: ChartShift[]) => list.reduce((sum, item) => sum + item.figures.grossReceiptsCents, 0);
  const byRank = (a: string, b: string) => ranks.get(a)! - ranks.get(b)!;
  const shown = [...groups.keys()]
    .sort((a, b) => grossOf(groups.get(b)!) - grossOf(groups.get(a)!) || byRank(a, b))
    .slice(0, MAX_SERIES)
    .sort(byRank);

  // Σημεία ανά οδηγό (για όλους — ο μέσος όρος καλύπτει και όσους δεν σχεδιάζονται).
  const pointsByDriver = new Map<string, ChartPoint[]>();
  for (const [driverId, list] of groups) {
    let points: ChartPoint[];
    if (mode === 'months') {
      points = Array.from({ length: 12 }, emptyPoint);
      for (const item of list) {
        const point = points[item.row.month - 1];
        if (point) addShift(point, item);
      }
    } else {
      points = [...list].sort(compareShifts).map((item) => {
        const point = emptyPoint();
        addShift(point, item);
        point.zNumber = item.row.z_number;
        return point;
      });
    }
    for (const point of points) point.value = metricValue(metric, point);
    pointsByDriver.set(driverId, points);
  }

  let xLabels: string[];
  let xTitles: string[];
  if (mode === 'months') {
    xLabels = [...SHORT_MONTHS];
    xTitles = SHORT_MONTHS.map((_, index) => `${monthName(index + 1)} ${year}`);
  } else if (groups.size === 1) {
    const zNumbers = [...pointsByDriver.values()][0].map((point) => point.zNumber ?? '');
    xLabels = zNumbers;
    xTitles = zNumbers.map((z) => `Ζ ${z}`);
  } else {
    const length = Math.max(0, ...shown.map((id) => pointsByDriver.get(id)!.length));
    xLabels = Array.from({ length }, (_, index) => String(index + 1));
    xTitles = xLabels.map((label) => `${label}η βάρδια του μήνα`);
  }

  const series: ChartSeries[] = shown.map((driverId) => {
    const points = pointsByDriver.get(driverId)!;
    const rank = ranks.get(driverId)!;
    return {
      driverId,
      name: names.get(driverId) ?? '—',
      color: rank < SERIES_COLORS ? rank : null,
      points: xLabels.map((_, index) => points[index] ?? emptyPoint()),
    };
  });

  // Μέσος όρος όλων των σημείων με δεδομένα (όλων των οδηγών).
  const withData = [...pointsByDriver.values()].flat().filter((point) => point.shifts > 0);
  let average: number | null = null;
  if (metric === 'avgTrip') {
    const trips = withData.reduce((sum, point) => sum + point.trips, 0);
    const fare = withData.reduce((sum, point) => sum + point.fareCents, 0);
    average = trips > 0 ? fare / trips : null;
  } else if (withData.length > 0) {
    const total = withData.reduce((sum, point) => sum + (metric === 'gross' ? point.grossCents : point.trips), 0);
    average = total / withData.length;
  }
  const averageLabel =
    metric === 'avgTrip'
      ? 'Μέση αξία περιόδου'
      : mode === 'shifts'
        ? 'Μ.Ο. ανά βάρδια'
        : groups.size > 1
          ? 'Μ.Ο. ανά οδηγό και μήνα'
          : 'Μ.Ο. ανά μήνα';

  const values = series.flatMap((s) => s.points.map((point) => point.value ?? 0));
  const maxValue = Math.max(0, average ?? 0, ...values);

  return {
    mode,
    metric,
    xLabels,
    xTitles,
    series,
    hiddenDrivers: groups.size - shown.length,
    average,
    averageLabel,
    maxValue,
  };
}

/**
 * «Στρογγυλές» υποδιαιρέσεις άξονα από το 0 έως (τουλάχιστον) `max`:
 * βήματα 1 / 2 / 2,5 / 5 × 10ⁿ (χωρίς 2,5 για ακέραια μεγέθη).
 */
export function niceTicks(max: number, { count = 4, integer = false }: { count?: number; integer?: boolean } = {}): number[] {
  const top = max > 0 ? max : 1;
  const raw = top / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const factors = integer ? [1, 2, 5, 10] : [1, 2, 2.5, 5, 10];
  let step = (factors.find((factor) => factor * magnitude >= raw) ?? 10) * magnitude;
  if (integer) step = Math.max(1, Math.round(step));
  const steps = Math.ceil(Number((top / step).toPrecision(12)));
  return Array.from({ length: steps + 1 }, (_, index) => Number((index * step).toPrecision(12)));
}
