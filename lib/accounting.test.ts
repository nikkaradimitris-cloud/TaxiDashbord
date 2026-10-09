import { describe, expect, it } from 'vitest';
import {
  computeShift,
  figuresFromStored,
  includedExpenseVatCents,
  revenueVatCents,
  summarize,
  computeExpense,
  expenseFromStored,
  toCents,
  vatStatus,
  type ShiftInput,
} from './accounting';

const emptyShift: ShiftInput = {
  trips: 0,
  paidKm: 0,
  emptyKm: 0,
  netRevenue: 0,
  tips: 0,
  fuel: 0,
  otherExpenses: 0,
  repairs: 0,
};

/** Ακριβής αναφορά με BigInt: round(λεπτά × 0.129933) μισό προς τα πάνω. */
function referenceRevenueVat(cents: number): number {
  return Number((BigInt(cents) * BigInt(129933) + BigInt(500000)) / BigInt(1000000));
}

/** Ακριβής αναφορά με BigInt: round(λεπτά × 24 / 124) μισό προς τα πάνω. */
function referenceExpenseVat(cents: number): number {
  return Number((BigInt(cents) * BigInt(48) + BigInt(124)) / BigInt(248));
}

describe('ΦΠΑ εσόδων 13% (συντελεστής 0.129933)', () => {
  it('160,39 € καθαρά → 20,84 € ΦΠΑ (παράδειγμα προδιαγραφών)', () => {
    expect(revenueVatCents(16039)).toBe(2084);
    expect(computeShift({ ...emptyShift, netRevenue: 160.39 }).vatCents).toBe(2084);
  });

  it('ταιριάζει με ακριβή ακέραια αριθμητική για κάθε ποσό έως 20.000 €', () => {
    for (let cents = 0; cents <= 2_000_000; cents += 7) {
      expect(revenueVatCents(cents)).toBe(referenceRevenueVat(cents));
    }
  });

  it('μηδενικά έσοδα → μηδενικός ΦΠΑ', () => {
    expect(revenueVatCents(0)).toBe(0);
  });
});

describe('ΦΠΑ εξόδων 24% (εμπεριεχόμενος)', () => {
  it('124 € μικτά → 24 € ΦΠΑ', () => {
    expect(includedExpenseVatCents(12400)).toBe(2400);
  });

  it('50 € καύσιμα → 9,68 € ΦΠΑ (50 / 1.24 × 0.24)', () => {
    expect(includedExpenseVatCents(5000)).toBe(968);
  });

  it('ταιριάζει με ακριβή ακέραια αριθμητική', () => {
    for (let cents = 0; cents <= 500_000; cents += 3) {
      expect(includedExpenseVatCents(cents)).toBe(referenceExpenseVat(cents));
    }
  });
});

describe('computeShift', () => {
  const shift = computeShift({
    trips: 14,
    paidKm: 80.5,
    emptyKm: 40,
    netRevenue: 160.39,
    tips: 5,
    fuel: 40,
    otherExpenses: 10,
    repairs: 0,
  });

  it('μικτή είσπραξη = καθαρά + ΦΠΑ 13% + φιλοδωρήματα', () => {
    expect(shift.grossReceiptsCents).toBe(16039 + 2084 + 500);
  });

  it('συμψηφισμός ΦΠΑ: 13% εσόδων − 24% εξόδων', () => {
    expect(shift.totalExpensesCents).toBe(5000);
    expect(shift.expensesVatCents).toBe(968);
    expect(shift.vatBalanceCents).toBe(2084 - 968);
  });

  it('καθαρό ταμείο = (καθαρά + ΦΠΑ + φιλοδωρήματα) − έξοδα', () => {
    expect(shift.netCashCents).toBe(16039 + 2084 + 500 - 5000);
  });

  it('συνολικά χιλιόμετρα', () => {
    expect(shift.totalKm).toBe(120.5);
  });

  it('τα φιλοδωρήματα δεν επιβαρύνονται με ΦΠΑ', () => {
    const withTips = computeShift({ ...emptyShift, netRevenue: 100, tips: 50 });
    const withoutTips = computeShift({ ...emptyShift, netRevenue: 100 });
    expect(withTips.vatCents).toBe(withoutTips.vatCents);
    expect(withTips.grossReceiptsCents - withoutTips.grossReceiptsCents).toBe(5000);
  });

  it('πιστωτικό υπόλοιπο όταν ο ΦΠΑ εξόδων ξεπερνά τον ΦΠΑ εσόδων', () => {
    const repairsDay = computeShift({ ...emptyShift, netRevenue: 20, repairs: 620 });
    expect(repairsDay.vatBalanceCents).toBe(260 - 12000);
    expect(vatStatus(repairsDay.vatBalanceCents)).toBe('credit');
  });
});

describe('figuresFromStored', () => {
  it('δέχεται τις τιμές της βάσης (numeric) και κρατά τον ΦΠΑ της βάσης', () => {
    const figures = figuresFromStored({
      trips: 3,
      paid_km: 10.1,
      empty_km: 5.25,
      net_revenue: 160.39,
      vat: 20.84,
      tips: 0,
      fuel: 50,
      other_expenses: 0,
      repairs: 0,
      expenses_vat: 9.68,
    });
    expect(figures.vatCents).toBe(2084);
    expect(figures.expensesVatCents).toBe(968);
    expect(figures.vatBalanceCents).toBe(1116);
    expect(figures.totalKm).toBe(15.35);
  });
});

describe('summarize', () => {
  it('άδεια περίοδος: μηδενικά χωρίς NaN', () => {
    const totals = summarize([]);
    expect(totals.shifts).toBe(0);
    expect(totals.utilizationPct).toBe(0);
    expect(totals.revenuePerKm).toBe(0);
    expect(totals.netCashCents).toBe(0);
  });

  it('αξιοποίηση % και έσοδο ανά χλμ', () => {
    const totals = summarize([
      computeShift({ ...emptyShift, paidKm: 60, emptyKm: 40, netRevenue: 80 }),
      computeShift({ ...emptyShift, paidKm: 90, emptyKm: 10, netRevenue: 120 }),
    ]);
    expect(totals.shifts).toBe(2);
    expect(totals.paidKm).toBe(150);
    expect(totals.totalKm).toBe(200);
    expect(totals.utilizationPct).toBe(75);
    expect(totals.revenuePerKm).toBe(1); // 200 € / 200 χλμ
  });

  it('τα σύνολα είναι άθροισμα των βαρδιών (χωρίς σφάλματα δεκαδικών)', () => {
    const shifts = Array.from({ length: 30 }, () =>
      computeShift({ ...emptyShift, netRevenue: 0.1, tips: 0.2, fuel: 0.3, paidKm: 0.1, emptyKm: 0.2 }),
    );
    const totals = summarize(shifts);
    expect(totals.netRevenueCents).toBe(300);
    expect(totals.tipsCents).toBe(600);
    expect(totals.totalExpensesCents).toBe(900);
    expect(totals.totalKm).toBe(9);
    expect(totals.vatBalanceCents).toBe(totals.vatCents - totals.expensesVatCents);
    expect(totals.netCashCents).toBe(totals.grossReceiptsCents - totals.totalExpensesCents);
  });
});

describe('έξοδα οχήματος (εκτός βάρδιας)', () => {
  it('ΦΠΑ 24% μέσα στο ποσό: συνεργείο 800 € → 154,84 €', () => {
    expect(computeExpense(800)).toEqual({ amountCents: 80000, vatCents: 15484, vatOnly: false });
    expect(expenseFromStored({ amount: 800, vat: 154.84, category: 'repairs' })).toEqual({
      amountCents: 80000,
      vatCents: 15484,
      vatOnly: false,
    });
    expect(expenseFromStored({ amount: 12.4, vat: null, category: 'other' })).toEqual({
      amountCents: 1240,
      vatCents: 240,
      vatOnly: true,
    });
  });

  it('επισκευές: στα έξοδα, στον ΦΠΑ εξόδων και στο ταμείο της περιόδου — όχι στη βάρδια', () => {
    // Βάρδια: 160,39 € καθαρά (ΦΠΑ 20,84), 5 € φιλοδωρήματα, 40 € καύσιμα (ΦΠΑ 7,74).
    const shift = computeShift({ ...emptyShift, netRevenue: 160.39, tips: 5, fuel: 40 });
    const totals = summarize([shift], [computeExpense(800), computeExpense(10)]);
    expect(totals.fuelCents).toBe(4000);
    expect(totals.vehicleExpensesCents).toBe(81000);
    expect(totals.expenseCount).toBe(2);
    expect(totals.totalExpensesCents).toBe(85000);
    expect(totals.expensesVatCents).toBe(774 + 15484 + 194);
    expect(totals.vatBalanceCents).toBe(2084 - 16452); // −143,68 € → πιστωτικό
    expect(totals.netCashCents).toBe(18623 - 85000);
    // Η βάρδια μένει καθαρή: ταμείο 146,23 €.
    expect(shift.netCashCents).toBe(14623);
  });

  it('«Άλλα έξοδα»: μετράει μόνο ο ΦΠΑ τους — όχι στα έξοδα, όχι στο ταμείο', () => {
    const shift = computeShift({ ...emptyShift, netRevenue: 160.39, tips: 5, fuel: 40 });
    // Επισκευή 124 € (ΦΠΑ 24,00) + «Άλλα έξοδα» 10 € (ΦΠΑ 1,94).
    const totals = summarize([shift], [computeExpense(124), computeExpense(10, 'other')]);
    expect(totals.vehicleExpensesCents).toBe(12400);
    expect(totals.vatOnlyExpensesCents).toBe(1000);
    expect(totals.vatOnlyExpensesVatCents).toBe(194);
    expect(totals.expenseCount).toBe(2);
    expect(totals.totalExpensesCents).toBe(4000 + 12400);
    expect(totals.expensesVatCents).toBe(774 + 2400 + 194);
    expect(totals.vatBalanceCents).toBe(2084 - (774 + 2400 + 194));
    expect(totals.netCashCents).toBe(18623 - 4000 - 12400);
    expect(totals.netCashCents).toBe(totals.grossReceiptsCents - totals.totalExpensesCents);
  });

  it('μόνο «Άλλα έξοδα» στον μήνα: πιστωτικός ΦΠΑ, ταμείο ανέγγιχτο', () => {
    const totals = summarize([], [computeExpense(180, 'other'), computeExpense(20, 'other')]);
    expect(totals.totalExpensesCents).toBe(0);
    expect(totals.netCashCents).toBe(0);
    expect(totals.expensesVatCents).toBe(3484 + 387);
    expect(totals.vatBalanceCents).toBe(-(3484 + 387));
  });

  it('χωρίς βάρδιες: μόνο τα έξοδα του μήνα', () => {
    const totals = summarize([], [computeExpense(124)]);
    expect(totals.shifts).toBe(0);
    expect(totals.totalExpensesCents).toBe(12400);
    expect(totals.vatBalanceCents).toBe(-2400);
    expect(totals.netCashCents).toBe(-12400);
  });

  it('καύσιμα + έξοδα οχήματος = σύνολο εξόδων (και με παλιά ποσά μέσα σε βάρδιες)', () => {
    const legacy = computeShift({ ...emptyShift, fuel: 30, otherExpenses: 5, repairs: 100 });
    const totals = summarize([legacy], [computeExpense(50)]);
    expect(totals.fuelCents + totals.vehicleExpensesCents).toBe(totals.totalExpensesCents);
    expect(totals.vehicleExpensesCents).toBe(15500);
  });
});

describe('κρατήσεις εφαρμογών', () => {
  // Βάρδια: 20 διαδρομές, 160,39 € καθαρά (ΦΠΑ 20,84), 40 € καύσιμα (ΦΠΑ 7,74).
  const shift = computeShift({ ...emptyShift, trips: 20, netRevenue: 160.39, fuel: 40 });
  const uber = { trips: 5, turnoverCents: 6000, commissionCents: 900, commissionVatCents: 0 };
  const freenow = { trips: 3, turnoverCents: 4000, commissionCents: 620, commissionVatCents: 120 };

  it('μπαίνουν στα έξοδα και στο ταμείο· ΦΠΑ συμψηφίζεται μόνο της FreeNow', () => {
    const totals = summarize([shift], [], [uber, freenow]);
    expect(totals.appCommissionCents).toBe(1520);
    expect(totals.appCommissionVatCents).toBe(120);
    expect(totals.totalExpensesCents).toBe(4000 + 1520);
    expect(totals.expensesVatCents).toBe(774 + 120);
    expect(totals.vatBalanceCents).toBe(2084 - 894);
    expect(totals.netCashCents).toBe(shift.grossReceiptsCents - 5520);
    // Τα καύσιμα και τα έξοδα οχήματος δεν αλλάζουν.
    expect(totals.fuelCents).toBe(4000);
    expect(totals.vehicleExpensesCents).toBe(0);
  });

  it('διαδρομές από τον δρόμο = διαδρομές Ζ − διαδρομές εφαρμογών', () => {
    const totals = summarize([shift], [], [uber, freenow]);
    expect(totals.trips).toBe(20);
    expect(totals.appTrips).toBe(8);
    expect(totals.streetTrips).toBe(12);
    expect(totals.appTurnoverCents).toBe(10000);
  });

  it('χωρίς εφαρμογές όλες οι διαδρομές είναι από τον δρόμο', () => {
    const totals = summarize([shift]);
    expect(totals.appTrips).toBe(0);
    expect(totals.streetTrips).toBe(20);
    expect(totals.appCommissionCents).toBe(0);
  });
});

describe('vatStatus', () => {
  it('χρεωστικό / πιστωτικό / μηδενικό', () => {
    expect(vatStatus(1)).toBe('debit');
    expect(vatStatus(-1)).toBe('credit');
    expect(vatStatus(0)).toBe('zero');
  });
});

describe('toCents', () => {
  it('στρογγυλοποιεί σωστά τα δεκαδικά της JavaScript', () => {
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(1.005)).toBe(101);
    expect(toCents(160.39)).toBe(16039);
  });
});
