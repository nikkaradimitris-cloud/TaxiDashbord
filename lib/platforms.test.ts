import { describe, expect, it } from 'vitest';
import {
  commissionRatePct,
  commissionVatCents,
  EMPTY_STATEMENT_FORM,
  formatWeek,
  groupStatements,
  parseStatementForm,
  platformLabel,
  statementTitle,
  statementToFormValues,
  suggestedWeek,
  toStatementValues,
  totalsByPlatform,
  weekCycles,
  weekState,
  type StoredStatement,
} from './platforms';

const september = { year: 2026, month: 9 };

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
    expect(statementTitle({ ...base, platform: 'uber', kind: 'week' })).toBe('Uber · εβδομάδα 28–30 Σεπ');
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

describe('ΦΠΑ κράτησης', () => {
  it('FreeNow: 24% μέσα στο ποσό · Uber: χωρίς ΦΠΑ', () => {
    expect(commissionVatCents('freenow', 3100)).toBe(600);
    expect(commissionVatCents('freenow', 3720)).toBe(720);
    expect(commissionVatCents('uber', 3100)).toBe(0);
    expect(platformLabel('freenow')).toBe('FreeNow');
    expect(platformLabel('uber')).toBe('Uber');
  });
});

describe('parseStatementForm', () => {
  const week = { ...EMPTY_STATEMENT_FORM, weekStart: '2026-09-07', trips: '12', turnover: '240,00', commission: '36' };

  it('εβδομάδα: διαδρομές, τζίρος, κράτηση και ποσοστό', () => {
    const { input, errors, preview } = parseStatementForm(week, september);
    expect(errors).toEqual({});
    expect(input).toEqual({
      platform: 'uber',
      kind: 'week',
      weekStart: '2026-09-07',
      trips: 12,
      turnover: 240,
      commission: 36,
      reference: '',
    });
    expect(preview).toEqual({ commissionCents: 3600, vatCents: 0, ratePct: 15 });
  });

  it('FreeNow: ο ΦΠΑ της κράτησης στην προεπισκόπηση', () => {
    const { preview } = parseStatementForm({ ...week, platform: 'freenow', commission: '31' }, september);
    expect(preview.vatCents).toBe(600);
  });

  it('εβδομάδα: όλα τα πεδία υποχρεωτικά (το 0 επιτρέπεται)', () => {
    const empty = parseStatementForm({ ...EMPTY_STATEMENT_FORM, weekStart: '2026-09-07' }, september);
    expect(Object.keys(empty.errors).sort()).toEqual(['commission', 'trips', 'turnover']);
    expect(empty.input).toBeNull();
    const zero = parseStatementForm({ ...week, trips: '0', turnover: '0', commission: '0' }, september);
    expect(zero.errors).toEqual({});
    expect(zero.preview.ratePct).toBeNull();
  });

  it('εβδομάδα άλλου μήνα ή λάθος αρχή → σφάλμα', () => {
    expect(parseStatementForm({ ...week, weekStart: '2026-10-05' }, september).errors.weekStart).toBeDefined();
    expect(parseStatementForm({ ...week, weekStart: '2026-09-09' }, september).errors.weekStart).toBeDefined();
    expect(parseStatementForm({ ...week, weekStart: '' }, september).errors.weekStart).toBeDefined();
  });

  it('η κράτηση δεν ξεπερνά τον τζίρο', () => {
    expect(parseStatementForm({ ...week, commission: '240,01' }, september).errors.commission).toBeDefined();
    expect(parseStatementForm({ ...week, trips: '1,5' }, september).errors.trips).toBeDefined();
  });

  it('τιμολόγιο: μόνο ποσό (> 0) και προαιρετικός αριθμός', () => {
    const invoice = { ...EMPTY_STATEMENT_FORM, kind: 'invoice' as const, commission: '37,20', reference: ' FN-123 ' };
    const { input, errors } = parseStatementForm(invoice, september);
    expect(errors).toEqual({});
    expect(input).toMatchObject({ kind: 'invoice', weekStart: null, trips: 0, turnover: 0, commission: 37.2, reference: 'FN-123' });
    expect(parseStatementForm({ ...invoice, commission: '0' }, september).errors.commission).toBeDefined();
    expect(parseStatementForm({ ...invoice, reference: 'x'.repeat(61) }, september).errors.reference).toBeDefined();
  });
});

describe('toStatementValues / statementToFormValues', () => {
  it('εβδομάδα → γραμμή της βάσης (χωρίς ΦΠΑ και τέλος εβδομάδας)', () => {
    const values = { ...EMPTY_STATEMENT_FORM, weekStart: '2026-09-07', trips: '12', turnover: '240,555', commission: '36' };
    const row = toStatementValues(parseStatementForm(values, september).input!, { driverId: 'd', ...september });
    expect(row).toEqual({
      driver_id: 'd',
      platform: 'uber',
      kind: 'week',
      year: 2026,
      month: 9,
      week_start: '2026-09-07',
      trips: 12,
      turnover: 240.56,
      commission: 36,
      reference: '',
    });
    expect(row).not.toHaveProperty('commission_vat');
    expect(row).not.toHaveProperty('week_end');
  });

  it('η φόρμα διαβάζει ξανά την ίδια εγγραφή', () => {
    const week = statementToFormValues({
      platform: 'freenow',
      kind: 'week',
      week_start: '2026-09-07',
      trips: 0,
      turnover: 0,
      commission: 0,
      reference: '',
    });
    expect(week).toMatchObject({ platform: 'freenow', kind: 'week', trips: '0', turnover: '0', commission: '0' });
    expect(parseStatementForm(week, september).errors).toEqual({});

    const invoice = statementToFormValues({
      platform: 'uber',
      kind: 'invoice',
      week_start: null,
      trips: 0,
      turnover: 0,
      commission: 48.5,
      reference: 'U-9',
    });
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
    commission: 0,
    commission_vat: null,
    reference: '',
    ...changes,
  });

  it('χωρίς τιμολόγιο μετράει το άθροισμα των εβδομάδων', () => {
    const [group] = groupStatements([
      row({ trips: 4, turnover: 100, commission: 15.5, commission_vat: 3 }),
      row({ trips: 6, turnover: 100, commission: 15.5, commission_vat: 3 }),
    ]);
    expect(group).toMatchObject({ weeks: 2, trips: 10, turnoverCents: 20000, commissionCents: 3100, commissionVatCents: 600 });
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
      invoice: { commissionCents: 3720, vatCents: 720, reference: 'FN-1' },
    });
  });

  it('χωριστά ανά αυτοκίνητο, μήνα και εφαρμογή· σύνολα ανά εφαρμογή', () => {
    const months = groupStatements([
      row({ trips: 10, turnover: 200, commission: 31 }),
      row({ platform: 'uber', trips: 5, turnover: 100, commission: 15 }),
      row({ platform: 'uber', month: 10, trips: 2, turnover: 40, commission: 6 }),
      row({ platform: 'uber', month: 10, kind: 'invoice', commission: 7 }),
      row({ driver_id: 'other', trips: 1, turnover: 20, commission: 3 }),
    ]);
    expect(months).toHaveLength(4);
    // Χωρίς ΦΠΑ από τη βάση: υπολογίζεται (FreeNow 24%, Uber 0).
    expect(months.find((m) => m.driverId === 'car' && m.platform === 'freenow')?.commissionVatCents).toBe(600);

    const [uber, freenow] = totalsByPlatform(months);
    expect(uber).toMatchObject({ platform: 'uber', months: 2, invoiced: 1, trips: 7, commissionCents: 1500 + 700 });
    expect(freenow).toMatchObject({ platform: 'freenow', months: 2, invoiced: 0, trips: 11, commissionCents: 3400 });
    expect(totalsByPlatform([])).toEqual([]);
    // Ποσοστό από τις εβδομάδες (ίδιες εβδομάδες με τον τζίρο), όχι από το τιμολόγιο: (15 + 6) / (100 + 40).
    expect(uber.weeksCommissionCents).toBe(2100);
    expect(commissionRatePct(uber)).toBe(15);
    expect(commissionRatePct({ weeksCommissionCents: 0, turnoverCents: 0 })).toBeNull();
  });
});
