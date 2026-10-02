import { describe, expect, it } from 'vitest';
import { includedExpenseVatCents } from './accounting';
import {
  autoCommissionText,
  commissionVatCents,
  computeCommission,
  defaultVatRate,
  EMPTY_STATEMENT_FORM,
  findRate,
  formPlatforms,
  platformUse,
  workedPlatforms,
  fixedVatRate,
  formatWeek,
  groupStatements,
  isUnusualCommission,
  parseRateForm,
  parseStatementForm,
  platformLabel,
  rateLabel,
  rateToFormValues,
  statementRevenueCents,
  statementTitle,
  statementToFormValues,
  suggestedWeek,
  toRateValues,
  toStatementValues,
  totalsByPlatform,
  weekCycles,
  weekState,
  type StoredStatement,
} from './platforms';

const september = { year: 2026, month: 9 };
const freenow = { ratePct: 15, vatRate: 24 as const };
const uber = { ratePct: 12, vatRate: 0 as const };

describe('weekCycles: Δευτέρα–Κυριακή, κομμένες στον μήνα', () => {
  it('Οκτώβριος 2026 ξεκινά Πέμπτη: πρώτη εβδομάδα 1–4 (4 ημέρες), τελευταία 26–31', () => {
    expect(weekCycles(2026, 10)).toEqual([
      { start: '2026-10-01', end: '2026-10-04', days: 4 },
      { start: '2026-10-05', end: '2026-10-11', days: 7 },
      { start: '2026-10-12', end: '2026-10-18', days: 7 },
      { start: '2026-10-19', end: '2026-10-25', days: 7 },
      { start: '2026-10-26', end: '2026-10-31', days: 6 },
    ]);
  });

  it('Σεπτέμβριος 2026 ξεκινά Τρίτη και τελειώνει Τετάρτη', () => {
    const weeks = weekCycles(2026, 9);
    expect(weeks[0]).toEqual({ start: '2026-09-01', end: '2026-09-06', days: 6 });
    expect(weeks.at(-1)).toEqual({ start: '2026-09-28', end: '2026-09-30', days: 3 });
  });

  it('καλύπτουν όλες τις μέρες του μήνα χωρίς κενά (και σε δίσεκτο Φεβρουάριο)', () => {
    for (const [year, month, days] of [
      [2026, 2, 28],
      [2028, 2, 29],
      [2026, 12, 31],
      [2027, 3, 31],
    ]) {
      const weeks = weekCycles(year, month);
      expect(weeks.reduce((sum, week) => sum + week.days, 0)).toBe(days);
      expect(weeks.every((week) => week.days >= 1 && week.days <= 7)).toBe(true);
    }
  });

  it('μήνας που ξεκινά Κυριακή: η πρώτη «εβδομάδα» είναι μία μέρα', () => {
    // 1 Νοεμβρίου 2026 = Κυριακή.
    expect(weekCycles(2026, 11)[0]).toEqual({ start: '2026-11-01', end: '2026-11-01', days: 1 });
    expect(weekCycles(2026, 11)[1].start).toBe('2026-11-02');
  });

  it('ετικέτα εβδομάδας και καταχώρησης', () => {
    expect(formatWeek('2026-09-07', '2026-09-13')).toBe('7–13 Σεπ');
    expect(formatWeek('2026-11-01', '2026-11-01')).toBe('1 Νοε');
    const base = { year: 2026, month: 9, week_start: '2026-09-28' };
    expect(statementTitle({ ...base, platform: 'bolt', kind: 'week' })).toBe('Bolt · εβδομάδα 28–30 Σεπ');
    expect(statementTitle({ ...base, platform: 'freenow', kind: 'invoice', week_start: null })).toBe(
      'FreeNow · τιμολόγιο Σεπτέμβριος 2026',
    );
  });
});

describe('προτεινόμενη εβδομάδα και κατάσταση', () => {
  const weeks = weekCycles(2026, 9);

  it('η πρώτη που λείπει και έχει ξεκινήσει (συνήθως η προηγούμενη)', () => {
    const entered = new Set(['2026-09-01', '2026-09-07']);
    expect(suggestedWeek(weeks, entered, '2026-09-22')).toBe('2026-09-14');
    expect(suggestedWeek(weeks, new Set(), '2026-08-15')).toBe('2026-09-01');
    expect(suggestedWeek(weeks, new Set(weeks.map((week) => week.start)), '2026-09-22')).toBe('');
  });

  it('καταχωρημένη / λείπει / ανοιχτή', () => {
    const entered = new Set(['2026-09-07']);
    expect(weekState(weeks[1], entered, '2026-09-22')).toBe('done');
    expect(weekState(weeks[0], entered, '2026-09-22')).toBe('missing');
    expect(weekState(weeks[3], entered, '2026-09-22')).toBe('open'); // 21–27: σε εξέλιξη
    expect(weekState(weeks[4], entered, '2026-09-22')).toBe('open'); // 28–30: επόμενη
  });
});

describe('ποσοστό κράτησης και ΦΠΑ', () => {
  it('Uber πάντα χωρίς ΦΠΑ· FreeNow προεπιλογή με ΦΠΑ· Bolt το διαλέγει ο οδηγός', () => {
    expect(fixedVatRate('uber')).toBe(0);
    expect(fixedVatRate('freenow')).toBeNull();
    expect(fixedVatRate('bolt')).toBeNull();
    expect(defaultVatRate('freenow')).toBe(24);
    expect(defaultVatRate('bolt')).toBeNull();
    expect(platformLabel('bolt')).toBe('Bolt');
  });

  it('ετικέτα ρύθμισης', () => {
    expect(rateLabel(freenow)).toBe('15% + ΦΠΑ 24%');
    expect(rateLabel(uber)).toBe('12% χωρίς ΦΠΑ');
    expect(rateLabel({ ratePct: 12.25, vatRate: 0 })).toBe('12,25% χωρίς ΦΠΑ');
  });

  it('ΦΠΑ μέσα στην κράτηση: 24% ή τίποτα', () => {
    expect(commissionVatCents(24, 3100)).toBe(600);
    expect(commissionVatCents(0, 3100)).toBe(0);
  });

  it('η ρύθμιση βρίσκεται ανά αυτοκίνητο και εφαρμογή', () => {
    const rows = [
      { driver_id: 'a', platform: 'uber', rate_pct: 12, vat_rate: 0 },
      { driver_id: 'b', platform: 'uber', rate_pct: 10, vat_rate: 0 },
      { driver_id: 'a', platform: 'freenow', rate_pct: 15, vat_rate: 24 },
    ];
    expect(findRate(rows, 'a', 'freenow')).toEqual(freenow);
    expect(findRate(rows, 'b', 'uber')).toEqual({ ratePct: 10, vatRate: 0 });
    expect(findRate(rows, 'b', 'bolt')).toBeNull();
    expect(findRate(rows, null, 'uber')).toBeNull();
  });

  it('φόρμα ρύθμισης: ποσοστό υποχρεωτικό· ΦΠΑ υποχρεωτικός στη Bolt, κλειδωμένος στην Uber', () => {
    expect(parseRateForm({ rate: '15', vat: '24' }, 'freenow')).toEqual({ rate: freenow, errors: {} });
    expect(parseRateForm({ rate: '12,5', vat: '' }, 'uber').rate).toEqual({ ratePct: 12.5, vatRate: 0 });
    // Η Uber μένει χωρίς ΦΠΑ ό,τι κι αν σταλεί.
    expect(parseRateForm({ rate: '12', vat: '24' }, 'uber').rate).toEqual(uber);
    expect(parseRateForm({ rate: '20', vat: '' }, 'bolt').errors.vat).toBeDefined();
    expect(parseRateForm({ rate: '', vat: '0' }, 'bolt').errors.rate).toBeDefined();
    expect(parseRateForm({ rate: '0', vat: '0' }, 'bolt').errors.rate).toBeDefined();
    expect(parseRateForm({ rate: '101', vat: '0' }, 'bolt').errors.rate).toBeDefined();
    expect(parseRateForm({ rate: 'abc', vat: '0' }, 'bolt').errors.rate).toBeDefined();
  });

  it('τιμές φόρμας ρύθμισης και γραμμή βάσης', () => {
    expect(rateToFormValues(null, 'freenow')).toEqual({ rate: '', vat: '24' });
    expect(rateToFormValues(null, 'bolt')).toEqual({ rate: '', vat: '' });
    expect(rateToFormValues({ ratePct: 12.5, vatRate: 0 }, 'uber')).toEqual({ rate: '12,5', vat: '0' });
    expect(toRateValues({ ratePct: 12, vatRate: 24 }, { driverId: 'a', platform: 'uber' })).toEqual({
      driver_id: 'a',
      platform: 'uber',
      rate_pct: 12,
      vat_rate: 0,
    });
  });
});

describe('computeCommission: ποσοστό × (τζίρος − φιλοδωρήματα) + ΦΠΑ', () => {
  it('FreeNow 15% + ΦΠΑ: τζίρος 150 €, φιλοδωρήματα 10 € → 21,00 + 5,04 = 26,04 €', () => {
    expect(computeCommission(15000, 1000, freenow)).toEqual({
      baseCents: 14000,
      netCents: 2100,
      vatCents: 504,
      totalCents: 2604,
    });
  });

  it('Uber 12% χωρίς ΦΠΑ: τζίρος 60 €, φιλοδωρήματα 5 € → 6,60 €', () => {
    expect(computeCommission(6000, 500, uber)).toEqual({ baseCents: 5500, netCents: 660, vatCents: 0, totalCents: 660 });
  });

  it('στρογγυλοποίηση στο λεπτό (μισό λεπτό προς τα πάνω)', () => {
    // 12,5% × 0,99 € = 0,12375 → 0,12 €· 15% × 0,03 € = 0,0045 → 0,00 €· 15% × 0,10 € = 0,015 → 0,02 €.
    expect(computeCommission(99, 0, { ratePct: 12.5, vatRate: 0 }).netCents).toBe(12);
    expect(computeCommission(3, 0, { ratePct: 15, vatRate: 0 }).netCents).toBe(0);
    expect(computeCommission(10, 0, { ratePct: 15, vatRate: 0 }).netCents).toBe(2);
  });

  it('ο ΦΠΑ πάνω στην καθαρή κράτηση ίδιος με τον εμπεριεχόμενο της βάσης (ποσό / 1,24 × 0,24)', () => {
    for (let base = 0; base <= 60_000; base += 7) {
      const { vatCents, totalCents } = computeCommission(base, 0, { ratePct: 13.5, vatRate: 24 });
      expect(includedExpenseVatCents(totalCents)).toBe(vatCents);
    }
  });

  it('φιλοδωρήματα περισσότερα από τον τζίρο → καμία κράτηση', () => {
    expect(computeCommission(1000, 2000, freenow).totalCents).toBe(0);
  });
});

/** Το εβδομαδιαίο έγγραφο της FreeNow (12% + ΦΠΑ): 46 διαδρομές, 579,46 €, προμήθεια −85,14 €, επιβραβεύσεις 45,00 €. */
const freenow12 = { ratePct: 12, vatRate: 24 as const };
const documentWeek = {
  ...EMPTY_STATEMENT_FORM,
  platform: 'freenow' as const,
  weekStart: '2026-09-07',
  trips: '46',
  revenue: '579,46',
  commission: '85,14',
  tips: '45,00',
};

describe('parseStatementForm', () => {
  const week = documentWeek;

  it('εβδομάδα: όπως το έγγραφο — ο ΦΠΑ βγαίνει από την προμήθεια, τζίρος = έσοδα + φιλοδωρήματα/quest', () => {
    const { input, errors, preview } = parseStatementForm(week, september, freenow12);
    expect(errors).toEqual({});
    expect(preview).toEqual({
      commissionCents: 8514,
      vatCents: 1648,
      // 12% × 579,46 = 69,54 + ΦΠΑ 16,69: λίγο πάνω από το έγγραφο, γιατί τα φιλοδωρήματα μέσα στα έσοδα δεν έχουν προμήθεια.
      expected: { baseCents: 57946, netCents: 6954, vatCents: 1669, totalCents: 8623 },
      unusual: false,
    });
    expect(input).toEqual({
      platform: 'freenow',
      kind: 'week',
      weekStart: '2026-09-07',
      trips: 46,
      turnover: 624.46,
      tips: 45,
      commission: 85.14,
      reference: '',
      ratePct: 12,
      vatRate: 24,
    });
  });

  it('προμήθεια από άλλη γραμμή του εγγράφου → προειδοποίηση (όχι εμπόδιο)', () => {
    for (const line of ['539,30', '220,44', '45', '0,02']) {
      const parsed = parseStatementForm({ ...week, commission: line }, september, freenow12);
      expect(parsed.preview.unusual).toBe(true);
      expect(parsed.input).not.toBeNull();
    }
    expect(parseStatementForm({ ...week, commission: '82' }, september, freenow12).preview.unusual).toBe(false);
    // Μεγαλύτερη από τα έσοδα: σφάλμα.
    expect(parseStatementForm({ ...week, commission: '600' }, september, freenow12).errors.commission).toBeDefined();
  });

  it('έλεγχος προμήθειας: λίγο κάτω από το ποσοστό είναι φυσικό, πολύ πάνω ή πολύ κάτω όχι', () => {
    const expected = { baseCents: 10000, netCents: 1200, vatCents: 288, totalCents: 1488 };
    expect(isUnusualCommission(1488, expected)).toBe(false);
    expect(isUnusualCommission(1300, expected)).toBe(false);
    expect(isUnusualCommission(1567, expected)).toBe(false);
    expect(isUnusualCommission(1569, expected)).toBe(true);
    expect(isUnusualCommission(1041, expected)).toBe(true);
    expect(isUnusualCommission(5000, null)).toBe(false);
    expect(isUnusualCommission(0, { baseCents: 0, netCents: 0, vatCents: 0, totalCents: 0 })).toBe(false);
  });

  it('χωρίς ρύθμιση ποσοστού δεν γίνεται καταχώρηση', () => {
    expect(parseStatementForm(week, september, null).errors.rate).toBeDefined();
    expect(parseStatementForm(week, september, { ratePct: null, vatRate: 24 }).errors.rate).toBeDefined();
    const invoice = { ...EMPTY_STATEMENT_FORM, kind: 'invoice' as const, commission: '10' };
    // Για τιμολόγιο αρκεί να είναι γνωστός ο ΦΠΑ.
    expect(parseStatementForm(invoice, september, { ratePct: null, vatRate: 0 }).errors).toEqual({});
  });

  it('εβδομάδα: διαδρομές, έσοδα και προμήθεια υποχρεωτικά· φιλοδωρήματα/quest προαιρετικά', () => {
    const empty = parseStatementForm({ ...EMPTY_STATEMENT_FORM, weekStart: '2026-09-07' }, september, uber);
    expect(Object.keys(empty.errors).sort()).toEqual(['commission', 'revenue', 'trips']);
    expect(empty.input).toBeNull();
    const zero = parseStatementForm({ ...week, trips: '0', revenue: '0', commission: '0', tips: '' }, september, freenow);
    expect(zero.errors).toEqual({});
    expect(zero.input).toMatchObject({ turnover: 0, tips: 0, commission: 0 });
    // Μόνο quest (π.χ. κομμάτι εβδομάδας στην αλλαγή του μήνα): τζίρος = το quest.
    const onlyQuest = parseStatementForm({ ...week, trips: '0', revenue: '0', commission: '0', tips: '45' }, september, freenow);
    expect(onlyQuest.input).toMatchObject({ turnover: 45, tips: 45 });
    expect(parseStatementForm({ ...week, tips: 'x' }, september, freenow).errors.tips).toBeDefined();
    expect(parseStatementForm({ ...week, revenue: 'x' }, september, freenow).errors.revenue).toBeDefined();
    expect(parseStatementForm({ ...week, trips: '1,5' }, september, freenow).errors.trips).toBeDefined();
  });

  it('εβδομάδα άλλου μήνα ή λάθος αρχή → σφάλμα', () => {
    expect(parseStatementForm({ ...week, weekStart: '2026-10-05' }, september, freenow).errors.weekStart).toBeDefined();
    expect(parseStatementForm({ ...week, weekStart: '2026-09-09' }, september, freenow).errors.weekStart).toBeDefined();
    expect(parseStatementForm({ ...week, weekStart: '' }, september, freenow).errors.weekStart).toBeDefined();
  });

  it('τιμολόγιο: ποσό (> 0), ΦΠΑ από τη ρύθμιση, προαιρετικός αριθμός', () => {
    const invoice = { ...EMPTY_STATEMENT_FORM, platform: 'freenow' as const, kind: 'invoice' as const, commission: '37,20', reference: ' FN-123 ' };
    const { input, errors, preview } = parseStatementForm(invoice, september, freenow);
    expect(errors).toEqual({});
    expect(input).toMatchObject({ kind: 'invoice', weekStart: null, trips: 0, turnover: 0, tips: 0, commission: 37.2, reference: 'FN-123', ratePct: null, vatRate: 24 });
    expect(preview.vatCents).toBe(720);
    expect(parseStatementForm({ ...invoice, platform: 'uber' }, september, uber).preview.vatCents).toBe(0);
    expect(parseStatementForm({ ...invoice, commission: '0' }, september, freenow).errors.commission).toBeDefined();
    expect(parseStatementForm({ ...invoice, reference: 'x'.repeat(61) }, september, freenow).errors.reference).toBeDefined();
  });
});

describe('toStatementValues / statementToFormValues', () => {
  it('εβδομάδα → γραμμή της βάσης με ποσοστό και ΦΠΑ (χωρίς ποσό ΦΠΑ και τέλος εβδομάδας)', () => {
    const row = toStatementValues(parseStatementForm(documentWeek, september, freenow12).input!, { driverId: 'd', ...september });
    expect(row).toEqual({
      driver_id: 'd',
      platform: 'freenow',
      kind: 'week',
      year: 2026,
      month: 9,
      week_start: '2026-09-07',
      trips: 46,
      turnover: 624.46,
      tips: 45,
      rate_pct: 12,
      vat_rate: 24,
      commission: 85.14,
      reference: '',
    });
    expect(row).not.toHaveProperty('commission_vat');
    expect(row).not.toHaveProperty('week_end');
  });

  it('Uber: πάντα χωρίς ΦΠΑ στη βάση', () => {
    const values = { ...EMPTY_STATEMENT_FORM, weekStart: '2026-09-07', trips: '1', revenue: '10', commission: '1,20' };
    const input = parseStatementForm(values, september, { ratePct: 12, vatRate: 24 }).input!;
    expect(toStatementValues(input, { driverId: 'd', ...september }).vat_rate).toBe(0);
  });

  it('η φόρμα διαβάζει ξανά την ίδια εγγραφή: έσοδα = τζίρος − φιλοδωρήματα/quest', () => {
    const week = {
      platform: 'freenow',
      kind: 'week',
      week_start: '2026-09-07',
      trips: 46,
      turnover: 624.46,
      tips: 45,
      commission: 85.14,
      reference: '',
    };
    expect(statementRevenueCents(week)).toBe(57946);
    const values = statementToFormValues(week);
    expect(values).toEqual({
      ...EMPTY_STATEMENT_FORM,
      platform: 'freenow',
      weekStart: '2026-09-07',
      trips: '46',
      revenue: '579,46',
      tips: '45',
      commission: '85,14',
    });
    // Ξανά από τη φόρμα: ίδια γραμμή.
    expect(parseStatementForm(values, september, freenow12).input).toMatchObject({ turnover: 624.46, tips: 45, commission: 85.14 });

    const invoice = statementToFormValues({ ...week, platform: 'uber', kind: 'invoice', week_start: null, trips: 0, turnover: 0, tips: 0, commission: 48.5, reference: 'U-9' });
    expect(invoice).toEqual({ ...EMPTY_STATEMENT_FORM, kind: 'invoice', commission: '48,5', reference: 'U-9' });
  });
});

describe('groupStatements: το τιμολόγιο αντικαθιστά τις εβδομάδες', () => {
  const row = (changes: Partial<StoredStatement>): StoredStatement => ({
    driver_id: 'car',
    platform: 'freenow',
    kind: 'week',
    year: 2026,
    month: 9,
    trips: 0,
    turnover: 0,
    tips: 0,
    vat_rate: 24,
    commission: 0,
    commission_vat: null,
    reference: '',
    ...changes,
  });

  it('χωρίς τιμολόγιο μετράει το άθροισμα των εβδομάδων', () => {
    const [group] = groupStatements([
      row({ trips: 4, turnover: 100, tips: 5, commission: 15.5, commission_vat: 3 }),
      row({ trips: 6, turnover: 100, commission: 15.5, commission_vat: 3 }),
    ]);
    expect(group).toMatchObject({
      weeks: 2,
      trips: 10,
      // Έσοδα = τζίρος − φιλοδωρήματα/quest (τα quest δεν είναι μέσα στα Ζ).
      turnoverCents: 19500,
      tipsCents: 500,
      commissionCents: 3100,
      commissionVatCents: 600,
      commissionNoVatCents: 0,
    });
    expect(group.invoice).toBeNull();
  });

  it('με τιμολόγιο μετράει το τιμολόγιο (οι εβδομάδες μένουν για σύγκριση)', () => {
    const [group] = groupStatements([
      row({ trips: 10, turnover: 200, commission: 31, commission_vat: 6 }),
      row({ kind: 'invoice', commission: 37.2, commission_vat: 7.2, reference: 'FN-1' }),
    ]);
    expect(group).toMatchObject({
      trips: 10,
      turnoverCents: 20000,
      weeksCommissionCents: 3100,
      commissionCents: 3720,
      commissionVatCents: 720,
      invoice: { commissionCents: 3720, vatCents: 720, noVatCents: 0, reference: 'FN-1' },
    });
  });

  it('χωριστά ανά αυτοκίνητο, μήνα και εφαρμογή· κρατήσεις χωρίς ΦΠΑ· σύνολα ανά εφαρμογή', () => {
    const months = groupStatements([
      row({ trips: 10, turnover: 200, commission: 31 }),
      row({ platform: 'uber', vat_rate: 0, trips: 5, turnover: 100, commission: 15 }),
      row({ platform: 'uber', vat_rate: 0, month: 10, trips: 2, turnover: 40, commission: 6 }),
      row({ platform: 'uber', vat_rate: 0, month: 10, kind: 'invoice', commission: 7 }),
      row({ platform: 'bolt', vat_rate: 0, trips: 1, turnover: 20, commission: 4 }),
      row({ driver_id: 'other', trips: 1, turnover: 20, commission: 3 }),
    ]);
    expect(months).toHaveLength(5);
    // Χωρίς ΦΠΑ από τη βάση: υπολογίζεται από τον ΦΠΑ της καταχώρησης.
    expect(months.find((m) => m.driverId === 'car' && m.platform === 'freenow')?.commissionVatCents).toBe(600);
    expect(months.find((m) => m.platform === 'uber' && m.month === 10)?.commissionNoVatCents).toBe(700);

    const [uberTotals, freenowTotals, boltTotals] = totalsByPlatform(months);
    expect(uberTotals).toMatchObject({ platform: 'uber', months: 2, invoiced: 1, trips: 7, commissionCents: 2200, commissionNoVatCents: 2200 });
    expect(freenowTotals).toMatchObject({ platform: 'freenow', months: 2, invoiced: 0, trips: 11, commissionCents: 3400, commissionNoVatCents: 0 });
    expect(boltTotals).toMatchObject({ platform: 'bolt', commissionCents: 400, commissionVatCents: 0, commissionNoVatCents: 400 });
    expect(totalsByPlatform([])).toEqual([]);
  });
});

describe('«Δουλεύει με»: ποιες εφαρμογές ζητούνται για κάθε αυτοκίνητο', () => {
  const rates = [
    { driver_id: 'a', platform: 'uber', active: true },
    { driver_id: 'a', platform: 'freenow', active: false },
    { driver_id: 'b', platform: 'bolt', active: false },
  ];
  const statements = [
    { driver_id: 'a', month: 9, platform: 'bolt' },
    { driver_id: 'a', month: 9, platform: 'freenow' },
    { driver_id: 'b', month: 8, platform: 'uber' },
  ];

  it('με ποσοστό «μέσα», «εκτός», ή χωρίς ποσοστό', () => {
    expect(platformUse(rates, 'a', 'uber')).toBe('on');
    expect(platformUse(rates, 'a', 'freenow')).toBe('off');
    expect(platformUse(rates, 'a', 'bolt')).toBe('unset');
  });

  it('εβδομάδες μόνο για όσες δουλεύει· η «εκτός» δεν ζητείται ούτε με καταχωρήσεις στον μήνα', () => {
    // Uber (ποσοστό) και Bolt (χωρίς ποσοστό, με καταχώρηση)· FreeNow «εκτός» παρά την καταχώρηση.
    expect(workedPlatforms(rates, statements, 'a', 9)).toEqual(['uber', 'bolt']);
    // Άλλος μήνας: μόνο όσες έχουν ποσοστό.
    expect(workedPlatforms(rates, statements, 'a', 10)).toEqual(['uber']);
    expect(workedPlatforms(rates, statements, 'b', 9)).toEqual([]);
  });

  it('φόρμα: όλες εκτός από τις «εκτός»· αν είναι όλες «εκτός», όλες', () => {
    expect(formPlatforms(rates, 'a').map((p) => p.id)).toEqual(['uber', 'bolt']);
    expect(formPlatforms(rates, 'b').map((p) => p.id)).toEqual(['uber', 'freenow']);
    const allOff = ['uber', 'freenow', 'bolt'].map((platform) => ({ driver_id: 'c', platform, active: false }));
    expect(formPlatforms(allOff, 'c').map((p) => p.id)).toEqual(['uber', 'freenow', 'bolt']);
  });
});

describe('αυτόματη προμήθεια της εβδομάδας από το ποσοστό', () => {
  const freenow = { ratePct: 12, vatRate: 24 as const };
  const uber = { ratePct: 12, vatRate: 0 as const };

  it('ποσοστό × «Συνολικά έσοδα», + ΦΠΑ 24% όπου υπάρχει', () => {
    // 99 € × 12% = 11,88 € + ΦΠΑ 2,85 € = 14,73 €
    expect(autoCommissionText('99', freenow)).toBe('14,73');
    expect(autoCommissionText('150', freenow)).toBe('22,32');
    expect(autoCommissionText('99,5', freenow)).toBe('14,81');
    expect(autoCommissionText('60', uber)).toBe('7,20');
    expect(autoCommissionText('30', uber)).toBe('3,60');
    expect(autoCommissionText('0', freenow)).toBe('0,00');
  });

  it('χωρίς ποσοστό ή χωρίς έγκυρα έσοδα: κενό', () => {
    expect(autoCommissionText('', freenow)).toBe('');
    expect(autoCommissionText('αβγ', freenow)).toBe('');
    expect(autoCommissionText('99', null)).toBe('');
    expect(autoCommissionText('99', { ratePct: null, vatRate: 24 })).toBe('');
  });
});

