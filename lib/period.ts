/** Οργάνωση δεδομένων ανά Μήνα / Έτος (η φόρμα δεν έχει πεδίο ημερομηνίας). */

export const GREEK_MONTHS = [
  'Ιανουάριος',
  'Φεβρουάριος',
  'Μάρτιος',
  'Απρίλιος',
  'Μάιος',
  'Ιούνιος',
  'Ιούλιος',
  'Αύγουστος',
  'Σεπτέμβριος',
  'Οκτώβριος',
  'Νοέμβριος',
  'Δεκέμβριος',
] as const;

/** Μήνας 1-12 ή όλοι οι μήνες του έτους. */
export type MonthFilter = number | 'all';

export const FIRST_YEAR = 2020;

export function monthName(month: number): string {
  return GREEK_MONTHS[month - 1] ?? String(month);
}

/** "Σεπτέμβριος 2026" ή "Έτος 2026" για όλους τους μήνες. */
export function periodLabel(year: number, month: MonthFilter): string {
  return month === 'all' ? `Έτος ${year}` : `${monthName(month)} ${year}`;
}

/** Έτη για το dropdown: από το 2020 έως το επόμενο έτος, συν όσα υπάρχουν ήδη. */
export function yearOptions(currentYear: number, extraYears: readonly number[] = []): number[] {
  const years = new Set<number>(extraYears);
  for (let y = Math.min(FIRST_YEAR, currentYear); y <= currentYear + 1; y++) years.add(y);
  return [...years].sort((a, b) => b - a);
}

export function isValidYear(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 2000 && value <= 2100;
}

export function isValidMonth(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 12;
}
