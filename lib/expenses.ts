/**
 * Έξοδα οχήματος εκτός βάρδιας: «Επισκευές / Συντήρηση» ή «Άλλα έξοδα».
 * Καταχωρούνται ανά Έτος/Μήνα για το συγκεκριμένο αυτοκίνητο, με τελικό
 * ποσό (ΦΠΑ 24% μέσα). Οι επισκευές μετράνε στα έξοδα, στον ΦΠΑ και στο
 * ταμείο της περιόδου· από τα «Άλλα έξοδα» μετράει μόνο ο ΦΠΑ (lib/accounting.ts).
 */
import { computeExpense, round2, type ExpenseFigures } from './accounting';
import { parseDecimal } from './numbers';
import type { ExpenseInsert, ExpenseRow } from './types';

export const EXPENSE_CATEGORIES = [
  { id: 'repairs', label: 'Επισκευές / Συντήρηση' },
  { id: 'other', label: 'Άλλα έξοδα' },
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]['id'];

export function isExpenseCategory(value: unknown): value is ExpenseCategory {
  return EXPENSE_CATEGORIES.some((category) => category.id === value);
}

export function categoryLabel(id: string): string {
  return EXPENSE_CATEGORIES.find((category) => category.id === id)?.label ?? 'Άλλα έξοδα';
}

export const MAX_DESCRIPTION = 200;
const MAX_AMOUNT = 1_000_000;

/** Οι τιμές της φόρμας όπως τις πληκτρολογεί ο χρήστης. */
export interface ExpenseFormValues {
  category: ExpenseCategory;
  amount: string;
  description: string;
}

export const EMPTY_EXPENSE_FORM: ExpenseFormValues = { category: 'repairs', amount: '', description: '' };

export type ExpenseFormErrors = Partial<Record<keyof ExpenseFormValues, string>>;

export interface ParsedExpenseForm {
  /** Το ποσό σε ευρώ, ή null όταν υπάρχουν σφάλματα. */
  amount: number | null;
  errors: ExpenseFormErrors;
  /** Ζωντανή προεπισκόπηση ΦΠΑ (άκυρο ποσό → 0). */
  preview: ExpenseFigures;
}

export function parseExpenseForm(values: ExpenseFormValues): ParsedExpenseForm {
  const errors: ExpenseFormErrors = {};
  const amount = parseDecimal(values.amount);
  if (!values.amount.trim()) errors.amount = 'Γράψτε το ποσό (π.χ. 800 ή 45,50).';
  else if (amount === null) errors.amount = 'Μη έγκυρος αριθμός (π.χ. 45,50).';
  else if (round2(amount) <= 0) errors.amount = 'Το ποσό πρέπει να είναι μεγαλύτερο από 0.';
  else if (amount >= MAX_AMOUNT) errors.amount = 'Μη ρεαλιστική τιμή.';
  if (values.description.trim().length > MAX_DESCRIPTION) {
    errors.description = `Έως ${MAX_DESCRIPTION} χαρακτήρες.`;
  }
  if (!isExpenseCategory(values.category)) errors.category = 'Επιλέξτε κατηγορία.';

  const valid = Object.keys(errors).length === 0;
  return {
    amount: valid ? round2(amount!) : null,
    errors,
    preview: computeExpense(amount !== null && amount > 0 && amount < MAX_AMOUNT ? amount : 0, values.category),
  };
}

/** Οι στήλες του εξόδου για τη βάση (ο ΦΠΑ υπολογίζεται από τη βάση). */
export function toExpenseValues(
  values: ExpenseFormValues,
  amount: number,
  meta: { driverId: string; year: number; month: number },
): ExpenseInsert {
  return {
    driver_id: meta.driverId,
    year: meta.year,
    month: meta.month,
    category: values.category,
    description: values.description.trim(),
    amount: round2(amount),
  };
}

/** Αποθηκευμένο έξοδο → τιμές φόρμας, για διόρθωση (ελληνική υποδιαστολή). */
export function expenseToFormValues(row: Pick<ExpenseRow, 'category' | 'amount' | 'description'>): ExpenseFormValues {
  return {
    category: isExpenseCategory(row.category) ? row.category : 'other',
    amount: String(round2(Number(row.amount))).replace('.', ','),
    description: row.description,
  };
}
