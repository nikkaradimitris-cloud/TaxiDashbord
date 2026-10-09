/**
 * Λογιστική λογική ταξί.
 *
 * Οι τύποι εδώ είναι ΑΚΡΙΒΩΣ οι ίδιοι με τις υπολογιζόμενες (generated) στήλες
 * του πίνακα `shifts` στη βάση (supabase/migrations/*_taxi_fleet.sql):
 *
 *   ΦΠΑ εσόδων 13%       = round(καθαρά έσοδα × 0.129933, 2)
 *   Ταμείο (τζίρος)      = καθαρά έσοδα + ΦΠΑ 13% + φιλοδωρήματα   (ό,τι εισπράχθηκε, χωρίς αφαιρέσεις)
 *   Σύνολο εξόδων        = καύσιμα + άλλες δαπάνες + επισκευές
 *   ΦΠΑ εξόδων 24%       = round(σύνολο εξόδων / 1.24 × 0.24, 2)   (εμπεριεχόμενος)
 *   Προς απόδοση ΦΠΑ     = ΦΠΑ 13% − ΦΠΑ εξόδων 24%   (μετά τον συμψηφισμό)
 *   Καθαρό κέρδος        = ταμείο − προς απόδοση ΦΠΑ − σύνολο εξόδων
 *   (ταμείο μετά τα έξοδα = ταμείο − σύνολο εξόδων: η στήλη `net_cash` της βάσης)
 *
 * Έξοδα οχήματος εκτός βάρδιας καταχωρούνται χωριστά ανά μήνα και αυτοκίνητο
 * (πίνακας `vehicle_expenses`), πάντα με ΦΠΑ 24% μέσα:
 *   «Επισκευές / Συντήρηση» → στα έξοδα, στον ΦΠΑ εξόδων και στο κέρδος της περιόδου·
 *   «Άλλα έξοδα»            → μόνο ο ΦΠΑ τους (συμψηφίζεται)· το ποσό δεν αφαιρείται από το κέρδος.
 * Οι κρατήσεις των εφαρμογών (Uber / FreeNow / Bolt, πίνακας `platform_statements`)
 * μπαίνουν στα έξοδα και στο κέρδος· ΦΠΑ έχουν όσες τιμολογούνται με ΦΠΑ.
 *
 * Η βάση είναι η πηγή της αλήθειας για τις αποθηκευμένες βάρδιες· οι ίδιες
 * συναρτήσεις χρησιμοποιούνται στη φόρμα για ζωντανή προεπισκόπηση πριν την
 * αποθήκευση. Τα χρηματικά ποσά υπολογίζονται σε ακέραια λεπτά (cents) ώστε
 * να μην υπάρχουν σφάλματα κινητής υποδιαστολής.
 */

/** Επίσημος συντελεστής αποφορολόγησης ταξί (ΦΠΑ 13% επί του καθαρού). */
export const TAXI_VAT_COEFFICIENT = 0.129933;
/** Ο συντελεστής σε εκατομμυριοστά, για ακέραια αριθμητική. */
const TAXI_VAT_MICROS = 129_933;

/** Συντελεστής ΦΠΑ που εμπεριέχεται στα έξοδα (καύσιμα, δαπάνες, επισκευές). */
export const EXPENSE_VAT_RATE = 0.24;

/** Στρογγυλοποίηση "μισό μακριά από το μηδέν", όπως η round() της PostgreSQL. */
function roundHalfAwayFromZero(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value));
}

/**
 * Πολλαπλασιάζει με 100 και "καθαρίζει" τον θόρυβο της κινητής υποδιαστολής
 * (1.005 × 100 = 100.49999999999999 → 100.5), ώστε η στρογγυλοποίηση να
 * συμφωνεί με το numeric(…, 2) της PostgreSQL.
 */
function times100(value: number): number {
  return Number((value * 100).toPrecision(12));
}

/** Ευρώ → λεπτά (ακέραιος). */
export function toCents(amount: number): number {
  return roundHalfAwayFromZero(times100(amount));
}

/** Λεπτά → ευρώ. */
export function fromCents(cents: number): number {
  return cents / 100;
}

/** ΦΠΑ εσόδων 13% σε λεπτά: round(καθαρά × 0.129933, 2). Π.χ. 160,39 € → 20,84 €. */
export function revenueVatCents(netRevenueCents: number): number {
  return roundHalfAwayFromZero((netRevenueCents * TAXI_VAT_MICROS) / 1_000_000);
}

/** Εμπεριεχόμενος ΦΠΑ 24% σε λεπτά: round(ποσό / 1.24 × 0.24, 2). */
export function includedExpenseVatCents(grossExpensesCents: number): number {
  return roundHalfAwayFromZero((grossExpensesCents * 24) / 124);
}

/** Τα ποσά που καταχωρεί ο χρήστης για μία βάρδια (σε ευρώ / χιλιόμετρα). */
export interface ShiftInput {
  trips: number;
  paidKm: number;
  emptyKm: number;
  netRevenue: number;
  tips: number;
  fuel: number;
  otherExpenses: number;
  repairs: number;
}

/** Αποτελέσματα μίας βάρδιας. Τα πεδία `...Cents` είναι σε λεπτά του ευρώ. */
export interface ShiftFigures {
  trips: number;
  paidKm: number;
  emptyKm: number;
  totalKm: number;
  netRevenueCents: number;
  vatCents: number;
  tipsCents: number;
  grossReceiptsCents: number;
  fuelCents: number;
  otherExpensesCents: number;
  repairsCents: number;
  totalExpensesCents: number;
  expensesVatCents: number;
  vatBalanceCents: number;
  /** Ταμείο μετά τα έξοδα (ο ΦΠΑ μέσα): ταμείο − σύνολο εξόδων. */
  netCashCents: number;
  /** Καθαρό κέρδος: ταμείο − προς απόδοση ΦΠΑ (μετά τον συμψηφισμό) − σύνολο εξόδων. */
  profitCents: number;
}

/** Στρογγυλοποίηση ποσού/χλμ σε 2 δεκαδικά, όπως θα αποθηκευτεί στη βάση (numeric(…, 2)). */
export function round2(value: number): number {
  return roundHalfAwayFromZero(times100(value)) / 100;
}

export function computeShift(input: ShiftInput): ShiftFigures {
  const netRevenueCents = toCents(input.netRevenue);
  const tipsCents = toCents(input.tips);
  const fuelCents = toCents(input.fuel);
  const otherExpensesCents = toCents(input.otherExpenses);
  const repairsCents = toCents(input.repairs);

  const vatCents = revenueVatCents(netRevenueCents);
  const totalExpensesCents = fuelCents + otherExpensesCents + repairsCents;
  const expensesVatCents = includedExpenseVatCents(totalExpensesCents);
  const grossReceiptsCents = netRevenueCents + vatCents + tipsCents;

  const paidKm = round2(input.paidKm);
  const emptyKm = round2(input.emptyKm);

  return {
    trips: input.trips,
    paidKm,
    emptyKm,
    totalKm: round2(paidKm + emptyKm),
    netRevenueCents,
    vatCents,
    tipsCents,
    grossReceiptsCents,
    fuelCents,
    otherExpensesCents,
    repairsCents,
    totalExpensesCents,
    expensesVatCents,
    vatBalanceCents: vatCents - expensesVatCents,
    netCashCents: grossReceiptsCents - totalExpensesCents,
    profitCents: grossReceiptsCents - (vatCents - expensesVatCents) - totalExpensesCents,
  };
}

/** Γραμμή του πίνακα `shifts` όπως έρχεται από τη βάση (numeric → number). */
export interface StoredShiftAmounts {
  trips: number;
  paid_km: number;
  empty_km: number;
  net_revenue: number;
  vat: number | null;
  tips: number;
  fuel: number;
  other_expenses: number;
  repairs: number;
  expenses_vat: number | null;
}

/**
 * Μετατρέπει αποθηκευμένη βάρδια σε `ShiftFigures`, κρατώντας τον ΦΠΑ όπως
 * τον υπολόγισε η βάση (πηγή της αλήθειας).
 */
export function figuresFromStored(row: StoredShiftAmounts): ShiftFigures {
  const netRevenueCents = toCents(Number(row.net_revenue));
  const tipsCents = toCents(Number(row.tips));
  const fuelCents = toCents(Number(row.fuel));
  const otherExpensesCents = toCents(Number(row.other_expenses));
  const repairsCents = toCents(Number(row.repairs));
  const totalExpensesCents = fuelCents + otherExpensesCents + repairsCents;
  const vatCents = row.vat == null ? revenueVatCents(netRevenueCents) : toCents(Number(row.vat));
  const expensesVatCents =
    row.expenses_vat == null ? includedExpenseVatCents(totalExpensesCents) : toCents(Number(row.expenses_vat));
  const grossReceiptsCents = netRevenueCents + vatCents + tipsCents;
  const paidKm = round2(Number(row.paid_km));
  const emptyKm = round2(Number(row.empty_km));

  return {
    trips: Number(row.trips),
    paidKm,
    emptyKm,
    totalKm: round2(paidKm + emptyKm),
    netRevenueCents,
    vatCents,
    tipsCents,
    grossReceiptsCents,
    fuelCents,
    otherExpensesCents,
    repairsCents,
    totalExpensesCents,
    expensesVatCents,
    vatBalanceCents: vatCents - expensesVatCents,
    netCashCents: grossReceiptsCents - totalExpensesCents,
    profitCents: grossReceiptsCents - (vatCents - expensesVatCents) - totalExpensesCents,
  };
}

/** Έξοδο οχήματος εκτός βάρδιας: τελικό ποσό με ΦΠΑ 24% μέσα. */
export interface ExpenseFigures {
  amountCents: number;
  /** Εμπεριεχόμενος ΦΠΑ 24%: round(ποσό / 1.24 × 0.24, 2). */
  vatCents: number;
  /**
   * «Άλλα έξοδα»: μετράει μόνο ο ΦΠΑ (συμψηφίζεται)· το ποσό δεν μπαίνει στα έξοδα ούτε αφαιρείται από το
   * κέρδος. «Επισκευές / Συντήρηση»: και τα δύο.
   */
  vatOnly: boolean;
}

/** Η κατηγορία «Άλλα έξοδα» (`other`, lib/expenses.ts): μετράει μόνο ο ΦΠΑ της. */
export function isVatOnlyExpense(category: string | null | undefined): boolean {
  return category === 'other';
}

export function computeExpense(amount: number, category = 'repairs'): ExpenseFigures {
  const amountCents = toCents(amount);
  return { amountCents, vatCents: includedExpenseVatCents(amountCents), vatOnly: isVatOnlyExpense(category) };
}

/** Γραμμή του πίνακα `vehicle_expenses` όπως έρχεται από τη βάση. */
export interface StoredVehicleExpense {
  amount: number;
  vat: number | null;
  category: string;
}

/** Αποθηκευμένο έξοδο → ποσά, με τον ΦΠΑ όπως τον υπολόγισε η βάση. */
export function expenseFromStored(row: StoredVehicleExpense): ExpenseFigures {
  const amountCents = toCents(Number(row.amount));
  return {
    amountCents,
    vatCents: row.vat == null ? includedExpenseVatCents(amountCents) : toCents(Number(row.vat)),
    vatOnly: isVatOnlyExpense(row.category),
  };
}

/**
 * Μία εφαρμογή (Uber / FreeNow / Bolt) για ένα αυτοκίνητο και έναν μήνα:
 * διαδρομές και έσοδα από τις εβδομάδες· κράτηση από το τιμολόγιο του μήνα,
 * αλλιώς το άθροισμα των εβδομάδων (βλ. lib/platforms.ts).
 */
export interface PlatformFigures {
  trips: number;
  /** Έσοδα διαδρομών («Συνολικά Έσοδα» των εγγράφων), μέσα στα Ζ· χωρίς τα quest. */
  turnoverCents: number;
  /** Η κράτηση που μετράει στα έξοδα (με ΦΠΑ όπου υπάρχει). */
  commissionCents: number;
  /** ΦΠΑ 24% μέσα στην κράτηση (FreeNow)· 0 για την Uber. */
  commissionVatCents: number;
}

/** Σύνολα περιόδου + δείκτες απόδοσης. */
export interface Totals extends ShiftFigures {
  shifts: number;
  /**
   * Έξοδα οχήματος της περιόδου που μετράνε στα έξοδα και στο κέρδος: «Επισκευές / Συντήρηση» (και τυχόν
   * παλιά «Άλλες δαπάνες» / «Επισκευές» μέσα σε βάρδιες). Καύσιμα + έξοδα οχήματος + κρατήσεις εφαρμογών
   * = σύνολο εξόδων.
   */
  vehicleExpensesCents: number;
  /** «Άλλα έξοδα» της περιόδου: μετράει μόνο ο ΦΠΑ τους (μέσα στον ΦΠΑ εξόδων), όχι το ποσό. */
  vatOnlyExpensesCents: number;
  /** Ο ΦΠΑ 24% των «Άλλων εξόδων» (μέρος του ΦΠΑ εξόδων). */
  vatOnlyExpensesVatCents: number;
  /** Πλήθος καταχωρήσεων εξόδων οχήματος (όλων των ειδών). */
  expenseCount: number;
  /** Διαδρομές των εφαρμογών (μέσα στις διαδρομές των Ζ). */
  appTrips: number;
  /** Διαδρομές από τον δρόμο = διαδρομές Ζ − διαδρομές εφαρμογών. */
  streetTrips: number;
  /** Έσοδα διαδρομών των εφαρμογών (από τις εβδομάδες, χωρίς τα quest). */
  appTurnoverCents: number;
  /** Κρατήσεις των εφαρμογών που μετράνε στα έξοδα. */
  appCommissionCents: number;
  /** ΦΠΑ 24% μέσα στις κρατήσεις (μόνο FreeNow), μέσα στον ΦΠΑ εξόδων. */
  appCommissionVatCents: number;
  /** Αξιοποίηση % = μισθωμένα χλμ / συνολικά χλμ × 100 (0 αν δεν υπάρχουν χλμ). */
  utilizationPct: number;
  /** Έσοδο ανά χλμ = καθαρά έσοδα / συνολικά χλμ, σε ευρώ (0 αν δεν υπάρχουν χλμ). */
  revenuePerKm: number;
}

export function summarize(
  items: readonly ShiftFigures[],
  expenses: readonly ExpenseFigures[] = [],
  platforms: readonly PlatformFigures[] = [],
): Totals {
  let paidKmHundredths = 0;
  let emptyKmHundredths = 0;
  const sum = {
    trips: 0,
    netRevenueCents: 0,
    vatCents: 0,
    tipsCents: 0,
    grossReceiptsCents: 0,
    fuelCents: 0,
    otherExpensesCents: 0,
    repairsCents: 0,
    totalExpensesCents: 0,
    expensesVatCents: 0,
    vatBalanceCents: 0,
    netCashCents: 0,
  };

  for (const s of items) {
    paidKmHundredths += Math.round(times100(s.paidKm));
    emptyKmHundredths += Math.round(times100(s.emptyKm));
    sum.trips += s.trips;
    sum.netRevenueCents += s.netRevenueCents;
    sum.vatCents += s.vatCents;
    sum.tipsCents += s.tipsCents;
    sum.grossReceiptsCents += s.grossReceiptsCents;
    sum.fuelCents += s.fuelCents;
    sum.otherExpensesCents += s.otherExpensesCents;
    sum.repairsCents += s.repairsCents;
    sum.totalExpensesCents += s.totalExpensesCents;
    sum.expensesVatCents += s.expensesVatCents;
    sum.vatBalanceCents += s.vatBalanceCents;
    sum.netCashCents += s.netCashCents;
  }

  // Έξοδα οχήματος: ο ΦΠΑ τους πάντα στον ΦΠΑ εξόδων (συμψηφισμός). Το ποσό στα έξοδα και στο κέρδος
  // μόνο για «Επισκευές / Συντήρηση»· τα «Άλλα έξοδα» μετράνε μόνο για τον ΦΠΑ.
  let vehicleCents = 0;
  let vatOnlyCents = 0;
  let vatOnlyVatCents = 0;
  for (const e of expenses) {
    sum.expensesVatCents += e.vatCents;
    sum.vatBalanceCents -= e.vatCents;
    if (e.vatOnly) {
      vatOnlyCents += e.amountCents;
      vatOnlyVatCents += e.vatCents;
      continue;
    }
    vehicleCents += e.amountCents;
    sum.totalExpensesCents += e.amountCents;
    sum.netCashCents -= e.amountCents;
  }

  // Κρατήσεις εφαρμογών: στα έξοδα, στον ΦΠΑ εξόδων (όσες έχουν ΦΠΑ) και στο κέρδος.
  const app = { trips: 0, turnoverCents: 0, commissionCents: 0, commissionVatCents: 0 };
  for (const p of platforms) {
    app.trips += p.trips;
    app.turnoverCents += p.turnoverCents;
    app.commissionCents += p.commissionCents;
    app.commissionVatCents += p.commissionVatCents;
    sum.totalExpensesCents += p.commissionCents;
    sum.expensesVatCents += p.commissionVatCents;
    sum.vatBalanceCents -= p.commissionVatCents;
    sum.netCashCents -= p.commissionCents;
  }

  const totalKmHundredths = paidKmHundredths + emptyKmHundredths;
  const totalKm = totalKmHundredths / 100;

  return {
    ...sum,
    // Καθαρό κέρδος: ταμείο − προς απόδοση ΦΠΑ (μετά τον συμψηφισμό με όλα τα έξοδα) − σύνολο εξόδων.
    profitCents: sum.grossReceiptsCents - sum.vatBalanceCents - sum.totalExpensesCents,
    shifts: items.length,
    vehicleExpensesCents: vehicleCents + sum.otherExpensesCents + sum.repairsCents,
    vatOnlyExpensesCents: vatOnlyCents,
    vatOnlyExpensesVatCents: vatOnlyVatCents,
    expenseCount: expenses.length,
    appTrips: app.trips,
    streetTrips: sum.trips - app.trips,
    appTurnoverCents: app.turnoverCents,
    appCommissionCents: app.commissionCents,
    appCommissionVatCents: app.commissionVatCents,
    paidKm: paidKmHundredths / 100,
    emptyKm: emptyKmHundredths / 100,
    totalKm,
    utilizationPct: totalKmHundredths > 0 ? (paidKmHundredths / totalKmHundredths) * 100 : 0,
    revenuePerKm: totalKmHundredths > 0 ? sum.netRevenueCents / totalKmHundredths : 0,
  };
}

export type VatStatus = 'debit' | 'credit' | 'zero';

/** Θετικό υπόλοιπο = Χρεωστικό (πληρωμή), αρνητικό = Πιστωτικό. */
export function vatStatus(balanceCents: number): VatStatus {
  if (balanceCents > 0) return 'debit';
  if (balanceCents < 0) return 'credit';
  return 'zero';
}

export const VAT_STATUS_LABEL: Record<VatStatus, string> = {
  debit: 'Χρεωστικό',
  credit: 'Πιστωτικό',
  zero: 'Μηδενικό',
};

/** Η κατάσταση του ΦΠΑ με λίγα λόγια (κάρτα ΦΠΑ, εικόνα και μήνυμα WhatsApp). */
export const VAT_STATUS_TEXT: Record<VatStatus, string> = {
  debit: 'Χρεωστικό — προς πληρωμή',
  credit: 'Πιστωτικό υπόλοιπο',
  zero: 'Μηδενικό υπόλοιπο',
};
