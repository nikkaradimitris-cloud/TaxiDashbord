import { describe, expect, it } from 'vitest';
import { includedExpenseVatCents } from './accounting';
import {
  commissionFromPayout,
  commissionVatCents,
  computeCommission,
  defaultVatRate,
  EMPTY_STATEMENT_FORM,
  findRate,
  fixedVatRate,
  formatWeek,
  groupStatements,
  parseRateForm,
  parseStatementForm,
  platformLabel,
  rateLabel,
  rateToFormValues,
  statementPayoutCents,
  statementTitle,
  statementToFormValues,
  suggestedWeek,
  toRateValues,
  toStatementValues,
  totalsByPlatform,
  weekCycles,
  weekState,
  type PlatformRate,
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

describe('commissionFromPayout: από το ποσό μετά την κράτηση', () => {
  it('FreeNow 12% + ΦΠΑ, ποσό 941,92 € → τζίρος 1.106,58 €, κράτηση 132,79 + 31,87 = 164,66 €', () => {
    expect(commissionFromPayout(94192, 0, { ratePct: 12, vatRate: 24 })).toEqual({
      payoutCents: 94192,
      turnoverCents: 110658,
      baseCents: 110658,
      netCents: 13279,
      vatCents: 3187,
      totalCents: 16466,
    });
  });

  it('τα φιλοδωρήματα μένουν ολόκληρα στον οδηγό: η κράτηση μετράει μόνο στις κούρσες', () => {
    // FreeNow 15% + ΦΠΑ: τζίρος 150 €, φιλοδωρήματα 10 €, κράτηση 26,04 € → ποσό 123,96 €.
    expect(commissionFromPayout(12396, 1000, freenow)).toEqual({
      payoutCents: 12396,
      turnoverCents: 15000,
      baseCents: 14000,
      netCents: 2100,
      vatCents: 504,
      totalCents: 2604,
    });
    // Uber 12% χωρίς ΦΠΑ: τζίρος 60 €, φιλοδωρήματα 5 €, κράτηση 6,60 € → ποσό 53,40 €.
    expect(commissionFromPayout(5340, 500, uber)).toMatchObject({ turnoverCents: 6000, netCents: 660, vatCents: 0, totalCents: 660 });
  });

  it('πάντα: τζίρος − κράτηση = ποσό και η κράτηση είναι ακριβώς αυτή του ποσοστού (η μικρότερη)', () => {
    const rates: PlatformRate[] = [
      { ratePct: 12, vatRate: 24 },
      { ratePct: 15, vatRate: 24 },
      { ratePct: 12.5, vatRate: 24 },
      { ratePct: 12, vatRate: 0 },
      { ratePct: 25, vatRate: 0 },
      { ratePct: 0.01, vatRate: 24 },
      { ratePct: 80, vatRate: 24 },
      { ratePct: 99.99, vatRate: 0 },
    ];
    for (const rate of rates) {
      for (let payout = 0; payout <= 250_000; payout += rate.ratePct >= 80 ? 997 : 37) {
        const tips = payout % 3 === 0 ? Math.floor(payout / 10) : 0;
        const result = commissionFromPayout(payout, tips, rate);
        expect(result).not.toBeNull();
        const { turnoverCents, totalCents, netCents, vatCents } = result!;
        expect(turnoverCents - totalCents).toBe(payout);
        expect(computeCommission(turnoverCents, tips, rate)).toEqual({ baseCents: turnoverCents - tips, netCents, vatCents, totalCents });
        for (let smaller = Math.max(0, totalCents - 5); smaller < totalCents; smaller++) {
          expect(computeCommission(payout - tips + smaller, 0, rate).totalCents).not.toBe(smaller);
        }
      }
    }
  });

  it('κράτηση με ΦΠΑ ίση ή πάνω από τον τζίρο → δεν υπολογίζεται', () => {
    expect(commissionFromPayout(10000, 0, { ratePct: 100, vatRate: 0 })).toBeNull();
    expect(commissionFromPayout(10000, 0, { ratePct: 81, vatRate: 24 })).toBeNull();
    expect(commissionFromPayout(0, 0, { ratePct: 12, vatRate: 24 })).toMatchObject({ turnoverCents: 0, totalCents: 0 });
  });
});

describe('parseStatementForm', () => {
  const week = { ...EMPTY_STATEMENT_FORM, platform: 'freenow' as const, weekStart: '2026-09-07', trips: '6', payout: '123,96', tips: '10' };

  it('εβδομάδα: από το ποσό μετά την κράτηση βγαίνουν η κράτηση και ο τζίρος', () => {
    const { input, errors, preview } = parseStatementForm(week, september, freenow);
    expect(errors).toEqual({});
    expect(preview).toEqual({
      commissionCents: 2604,
      vatCents: 504,
      auto: { payoutCents: 12396, turnoverCents: 15000, baseCents: 14000, netCents: 2100, vatCents: 504, totalCents: 2604 },
    });
    expect(input).toEqual({
      platform: 'freenow',
      kind: 'week',
      weekStart: '2026-09-07',
      trips: 6,
      turnover: 150,
      tips: 10,
      commission: 26.04,
      reference: '',
      ratePct: 15,
      vatRate: 24,
    });
  });

  it('το παράδειγμα της FreeNow: 67 διαδρομές, 941,92 € με 12% + ΦΠΑ', () => {
    const values = { ...week, trips: '67', payout: '941,92', tips: '' };
    const { input, preview } = parseStatementForm(values, september, { ratePct: 12, vatRate: 24 });
    expect(input).toMatchObject({ trips: 67, turnover: 1106.58, tips: 0, commission: 164.66, ratePct: 12, vatRate: 24 });
    expect(preview.vatCents).toBe(3187);
  });

  it('ποσοστό που «τρώει» όλο τον τζίρο → σφάλμα ποσοστού', () => {
    expect(parseStatementForm(week, september, { ratePct: 100, vatRate: 0 }).errors.rate).toBeDefined();
  });

  it('χωρίς ρύθμιση ποσοστού δεν γίνεται καταχώρηση', () => {
    expect(parseStatementForm(week, september, null).errors.rate).toBeDefined();
    expect(parseStatementForm(week, september, { ratePct: null, vatRate: 24 }).errors.rate).toBeDefined();
    const invoice = { ...EMPTY_STATEMENT_FORM, kind: 'invoice' as const, commission: '10' };
    // Για τιμολόγιο αρκεί να είναι γνωστός ο ΦΠΑ.
    expect(parseStatementForm(invoice, september, { ratePct: null, vatRate: 0 }).errors).toEqual({});
  });

  it('εβδομάδα: διαδρομές και ποσό υποχρεωτικά· φιλοδωρήματα προαιρετικά', () => {
    const empty = parseStatementForm({ ...EMPTY_STATEMENT_FORM, weekStart: '2026-09-07' }, september, uber);
    expect(Object.keys(empty.errors).sort()).toEqual(['payout', 'trips']);
    expect(empty.input).toBeNull();
    const zero = parseStatementForm({ ...week, trips: '0', payout: '0', tips: '' }, september, freenow);
    expect(zero.errors).toEqual({});
    expect(zero.input).toMatchObject({ turnover: 0, commission: 0 });
    expect(parseStatementForm({ ...week, payout: 'x' }, september, freenow).errors.payout).toBeDefined();
    expect(parseStatementForm({ ...week, tips: '124' }, september, freenow).errors.tips).toBeDefined();
    expect(parseStatementForm({ ...week, tips: 'x' }, september, freenow).errors.tips).toBeDefined();
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
  it('εβδομάδα → γραμμή της βάσης με τζίρο, ποσοστό και ΦΠΑ (χωρίς ποσό ΦΠΑ και τέλος εβδομάδας)', () => {
    const values = { ...EMPTY_STATEMENT_FORM, platform: 'freenow' as const, weekStart: '2026-09-07', trips: '6', payout: '123,96', tips: '10' };
    const row = toStatementValues(parseStatementForm(values, september, freenow).input!, { driverId: 'd', ...september });
    expect(row).toEqual({
      driver_id: 'd',
      platform: 'freenow',
      kind: 'week',
      year: 2026,
      month: 9,
      week_start: '2026-09-07',
      trips: 6,
      turnover: 150,
      tips: 10,
      rate_pct: 15,
      vat_rate: 24,
      commission: 26.04,
      reference: '',
    });
    expect(row).not.toHaveProperty('commission_vat');
    expect(row).not.toHaveProperty('week_end');
  });

  it('Uber: πάντα χωρίς ΦΠΑ στη βάση', () => {
    const values = { ...EMPTY_STATEMENT_FORM, weekStart: '2026-09-07', trips: '1', payout: '10' };
    const input = parseStatementForm(values, september, { ratePct: 12, vatRate: 24 }).input!;
    expect(toStatementValues(input, { driverId: 'd', ...september }).vat_rate).toBe(0);
  });

  it('η φόρμα διαβάζει ξανά την ίδια εγγραφή: το ποσό = τζίρος − κράτηση', () => {
    const week = {
      platform: 'freenow',
      kind: 'week',
      week_start: '2026-09-07',
      trips: 67,
      turnover: 1106.58,
      tips: 0,
      commission: 164.66,
      reference: '',
    };
    expect(statementPayoutCents(week)).toBe(94192);
    const values = statementToFormValues(week);
    expect(values).toEqual({ ...EMPTY_STATEMENT_FORM, platform: 'freenow', weekStart: '2026-09-07', trips: '67', payout: '941,92' });
    // Ξανά από τη φόρμα: ίδιος τζίρος και ίδια κράτηση.
    expect(parseStatementForm(values, september, { ratePct: 12, vatRate: 24 }).input).toMatchObject({ turnover: 1106.58, commission: 164.66 });
    expect(statementToFormValues({ ...week, turnover: 150, tips: 10, commission: 26.04 })).toMatchObject({ payout: '123,96', tips: '10' });

    const invoice = statementToFormValues({ ...week, platform: 'uber', kind: 'invoice', week_start: null, trips: 0, turnover: 0, commission: 48.5, reference: 'U-9' });
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
      turnoverCents: 20000,
      payoutCents: 16900,
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
      // Το ποσό που πήρε ο οδηγός είναι από τις εβδομάδες, ό,τι κι αν γράφει το τιμολόγιο.
      payoutCents: 16900,
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
