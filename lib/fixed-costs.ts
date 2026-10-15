/**
 * Πάγια έξοδα κάθε αυτοκινήτου: σταθερά ΜΗΝΙΑΙΑ ποσά που μπαίνουν μία φορά
 * και αλλάζουν όποτε χρειαστεί — κόστος άδειας και Ταμείο / ΕΦΚΑ / ΙΚΑ.
 *
 * Μόνο αποθηκεύονται και φαίνονται στο πάνελ «Πάγια έξοδα»: δεν μπαίνουν στο
 * ταμείο, στα συνολικά έξοδα, στο καθαρό κέρδος ούτε στον ΦΠΑ
 * (`lib/accounting.ts` και οι υπολογιζόμενες στήλες της βάσης μένουν ίδια).
 *
 * Κάθε αυτοκίνητο έχει τα δικά του: τα πάγια ενός οδηγού δεν αθροίζονται ποτέ
 * με άλλου οδηγού, όπως και τα υπόλοιπα φορολογικά του στοιχεία.
 */
import { round2, toCents } from './accounting';
import { parseDecimal } from './numbers';
import type { DriverRow } from './types';

/** Τα πάγια ενός αυτοκινήτου όπως τα κρατά η βάση (`null` = δεν δηλώθηκε). */
export type FixedCosts = Pick<DriverRow, 'license_cost' | 'efka_cost'>;

export const FIXED_COST_FIELDS = [
  {
    id: 'license',
    column: 'license_cost',
    label: 'Κόστος άδειας',
    hint: 'Όσο σας κοστίζει η άδεια κάθε μήνα.',
  },
  {
    id: 'efka',
    column: 'efka_cost',
    label: 'Ταμείο / ΕΦΚΑ / ΙΚΑ',
    hint: 'Οι ασφαλιστικές εισφορές ενός μήνα.',
  },
] as const;

/** Τι είναι αυτά τα ποσά και τι ΔΕΝ αλλάζουν — φαίνεται πάνω στο πάνελ. */
export const FIXED_COSTS_NOTE =
  'Σταθερά ποσά κάθε μήνα, χωριστά για κάθε αυτοκίνητο: μπαίνουν μία φορά και τα αλλάζετε όποτε θέλετε. ' +
  'Φαίνονται μόνο εδώ — δεν αλλάζουν το Ταμείο, τα Συνολικά Έξοδα, το Καθαρό Κέρδος ούτε τον ΦΠΑ.';

/** Πάνω από αυτό το μηνιαίο ποσό μοιάζει με λάθος πληκτρολόγηση. */
const MAX_AMOUNT = 100_000;

/** Οι τιμές της φόρμας όπως τις πληκτρολογεί ο χρήστης. */
export interface FixedCostsFormValues {
  license: string;
  efka: string;
}

export const EMPTY_FIXED_COSTS_FORM: FixedCostsFormValues = { license: '', efka: '' };

export type FixedCostsErrors = Partial<Record<keyof FixedCostsFormValues, string>>;

export interface ParsedFixedCosts {
  /**
   * Τα ποσά για τη βάση (`null` σε κάθε πεδίο που έμεινε κενό: «δεν
   * δηλώθηκε»), ή `null` συνολικά όταν υπάρχει σφάλμα.
   */
  values: FixedCosts | null;
  errors: FixedCostsErrors;
}

/** Ένα πεδίο: κενό = δεν δηλώθηκε (`null`), αλλιώς ποσό από 0 έως το όριο. */
function parseAmount(raw: string): { amount: number | null; error?: string } {
  if (!raw.trim()) return { amount: null };
  const value = parseDecimal(raw);
  if (value === null) return { amount: null, error: 'Μη έγκυρος αριθμός (π.χ. 150 ή 210,50).' };
  if (value >= MAX_AMOUNT) return { amount: null, error: 'Μη ρεαλιστικό ποσό για έναν μήνα.' };
  return { amount: round2(value) };
}

export function parseFixedCosts(values: FixedCostsFormValues): ParsedFixedCosts {
  const license = parseAmount(values.license);
  const efka = parseAmount(values.efka);
  const errors: FixedCostsErrors = {};
  if (license.error) errors.license = license.error;
  if (efka.error) errors.efka = efka.error;
  if (Object.keys(errors).length > 0) return { values: null, errors };
  return { values: { license_cost: license.amount, efka_cost: efka.amount }, errors };
}

/** Αποθηκευμένα πάγια → τιμές φόρμας, για αλλαγή (ελληνική υποδιαστολή). */
export function fixedCostsToFormValues(row: FixedCosts): FixedCostsFormValues {
  const text = (value: number | null) => (value === null ? '' : String(round2(Number(value))).replace('.', ','));
  return { license: text(row.license_cost), efka: text(row.efka_cost) };
}

/** Η μία γραμμή του κλειστού πάνελ: σε πόσα αυτοκίνητα έχουν μπει τα πάγια. */
export function fixedCostsSummary(filled: number, total: number): string {
  if (total === 0) return 'Κανένα αυτοκίνητο ακόμη';
  if (filled === 0) return 'Δεν έχουν μπει ακόμη';
  if (total === 1) return 'Μπήκαν';
  if (filled === total) return `Μπήκαν σε όλα τα ${total} αυτοκίνητα`;
  return `Μπήκαν σε ${filled} από ${total} αυτοκίνητα`;
}

/** Έχει δηλωθεί έστω ένα από τα δύο ποσά; */
export function hasFixedCosts(row: FixedCosts): boolean {
  return row.license_cost !== null || row.efka_cost !== null;
}

/**
 * Τα πάγια ενός μήνα για ΕΝΑ αυτοκίνητο, σε λεπτά (`null` όταν δεν έχει
 * δηλωθεί κανένα ποσό). Ποτέ άθροισμα δύο αυτοκινήτων.
 */
export function fixedCostsTotalCents(row: FixedCosts): number | null {
  if (!hasFixedCosts(row)) return null;
  return toCents(Number(row.license_cost ?? 0)) + toCents(Number(row.efka_cost ?? 0));
}
