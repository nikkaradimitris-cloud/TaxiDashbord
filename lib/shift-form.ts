import { computeShift, round2, type ShiftFigures, type ShiftInput } from './accounting';
import { parseOptionalDecimal, parseOptionalInteger } from './numbers';
import type { ShiftInsert, ShiftRow } from './types';

/**
 * Οι τιμές της φόρμας όπως τις πληκτρολογεί ο χρήστης (κείμενο). Στη βάρδια
 * μπαίνουν μόνο τα καύσιμα· επισκευές και άλλα έξοδα είναι «Έξοδα Οχήματος».
 */
export interface ShiftFormValues {
  zNumber: string;
  trips: string;
  paidKm: string;
  emptyKm: string;
  netRevenue: string;
  tips: string;
  fuel: string;
}

export const EMPTY_SHIFT_FORM: ShiftFormValues = {
  zNumber: '',
  trips: '',
  paidKm: '',
  emptyKm: '',
  netRevenue: '',
  tips: '',
  fuel: '',
};

export type ShiftFormErrors = Partial<Record<keyof ShiftFormValues, string>>;

const MAX_KM = 100_000;
const MAX_AMOUNT = 1_000_000;

const DECIMAL_FIELDS: { key: Exclude<keyof ShiftFormValues, 'zNumber' | 'trips'>; max: number }[] = [
  { key: 'paidKm', max: MAX_KM },
  { key: 'emptyKm', max: MAX_KM },
  { key: 'netRevenue', max: MAX_AMOUNT },
  { key: 'tips', max: MAX_AMOUNT },
  { key: 'fuel', max: MAX_AMOUNT },
];

export interface ParsedShiftForm {
  /** null όταν υπάρχουν σφάλματα. */
  input: ShiftInput | null;
  errors: ShiftFormErrors;
  /** Ζωντανή προεπισκόπηση (τα άκυρα πεδία μετράνε ως 0). */
  preview: ShiftFigures;
}

export function parseShiftForm(values: ShiftFormValues): ParsedShiftForm {
  const errors: ShiftFormErrors = {};
  const numbers: Record<string, number> = {};

  if (!values.zNumber.trim()) errors.zNumber = 'Ο αριθμός Ζ είναι υποχρεωτικός.';
  else if (values.zNumber.trim().length > 40) errors.zNumber = 'Πολύ μεγάλος αριθμός Ζ.';

  const trips = parseOptionalInteger(values.trips);
  if (trips === null || trips > 10_000) errors.trips = 'Ακέραιος αριθμός (π.χ. 14).';
  numbers.trips = trips ?? 0;

  for (const { key, max } of DECIMAL_FIELDS) {
    const value = parseOptionalDecimal(values[key]);
    if (value === null) errors[key] = 'Μη έγκυρος αριθμός (π.χ. 12,5).';
    else if (value >= max) errors[key] = 'Μη ρεαλιστική τιμή.';
    numbers[key] = value ?? 0;
  }

  const input: ShiftInput = {
    trips: numbers.trips,
    paidKm: numbers.paidKm,
    emptyKm: numbers.emptyKm,
    netRevenue: numbers.netRevenue,
    tips: numbers.tips,
    fuel: numbers.fuel,
    otherExpenses: 0,
    repairs: 0,
  };

  return {
    input: Object.keys(errors).length === 0 ? input : null,
    errors,
    preview: computeShift(input),
  };
}

/**
 * Οι στήλες της βάρδιας για τη βάση. Τα ποσά στρογγυλοποιούνται σε 2 δεκαδικά όπως θα αποθηκευτούν.
 * Οι παλιές στήλες «Άλλες δαπάνες» / «Επισκευές» δεν στέλνονται (μένουν ό,τι ήταν, κανονικά 0).
 */
export function toShiftValues(
  input: ShiftInput,
  meta: { driverId: string; year: number; month: number; zNumber: string },
): Omit<ShiftInsert, 'id'> {
  return {
    driver_id: meta.driverId,
    year: meta.year,
    month: meta.month,
    z_number: meta.zNumber.trim(),
    trips: input.trips,
    paid_km: round2(input.paidKm),
    empty_km: round2(input.emptyKm),
    net_revenue: round2(input.netRevenue),
    tips: round2(input.tips),
    fuel: round2(input.fuel),
  };
}

/** Νέα γραμμή για τη βάση, με id από τη συσκευή (ασφαλής επανάληψη χωρίς διπλοεγγραφές). */
export function toShiftInsert(
  input: ShiftInput,
  meta: { id: string; driverId: string; year: number; month: number; zNumber: string },
): ShiftInsert & { id: string } {
  return { id: meta.id, ...toShiftValues(input, meta) };
}

/** Αριθμός της βάσης → κείμενο για τη φόρμα, με ελληνική υποδιαστολή (0 → κενό). */
function toInput(value: number | null | undefined): string {
  const n = round2(Number(value ?? 0));
  return n ? String(n).replace('.', ',') : '';
}

/** Αποθηκευμένη βάρδια → τιμές φόρμας, για διόρθωση. */
export function shiftToFormValues(
  row: Pick<ShiftRow, 'z_number' | 'trips' | 'paid_km' | 'empty_km' | 'net_revenue' | 'tips' | 'fuel'>,
): ShiftFormValues {
  return {
    zNumber: row.z_number,
    trips: row.trips ? String(row.trips) : '',
    paidKm: toInput(row.paid_km),
    emptyKm: toInput(row.empty_km),
    netRevenue: toInput(row.net_revenue),
    tips: toInput(row.tips),
    fuel: toInput(row.fuel),
  };
}
