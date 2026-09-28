import { describe, expect, it } from 'vitest';
import { computeShift, type ShiftInput } from './accounting';
import { buildChartData, isChartMetric, MAX_SERIES, niceTicks, type ChartDriver, type ChartShift } from './chart';

const A: ChartDriver = { id: 'a', name: 'ΑΛΕΞΗΣ', created_at: '2026-01-01T08:00:00Z' };
const B: ChartDriver = { id: 'b', name: 'ΒΑΣΙΛΗΣ', created_at: '2026-02-01T08:00:00Z' };

let seq = 0;
function shift(driverId: string, zNumber: string, input: Partial<ShiftInput>, month = 9): ChartShift {
  seq += 1;
  return {
    row: {
      id: `s${seq}`,
      driver_id: driverId,
      z_number: zNumber,
      month,
      created_at: `2026-${String(month).padStart(2, '0')}-10T10:${String(seq % 60).padStart(2, '0')}:00Z`,
    },
    figures: computeShift({ trips: 0, paidKm: 0, emptyKm: 0, netRevenue: 0, tips: 0, fuel: 0, otherExpenses: 0, repairs: 0, ...input }),
  };
}

describe('buildChartData — συγκεκριμένος μήνας, ένας οδηγός', () => {
  const items = [
    shift('a', '100', { netRevenue: 160.39, tips: 5, trips: 12 }),
    shift('a', '99', { netRevenue: 100, trips: 10 }),
    shift('a', '101', { netRevenue: 50, trips: 2 }),
  ];

  it('ένα σημείο ανά βάρδια, με αριθμητική σειρά Ζ', () => {
    const data = buildChartData(items, { metric: 'gross', year: 2026, month: 9, drivers: [A, B] });
    expect(data.mode).toBe('shifts');
    expect(data.xLabels).toEqual(['99', '100', '101']);
    expect(data.xTitles).toEqual(['Ζ 99', 'Ζ 100', 'Ζ 101']);
    expect(data.series).toHaveLength(1);
    expect(data.series[0]).toMatchObject({ driverId: 'a', name: 'ΑΛΕΞΗΣ', color: 0 });
    // Τζίρος = καθαρά + ΦΠΑ 13% + φιλοδωρήματα: 160,39 + 20,84 + 5,00 = 186,23 €
    expect(data.series[0].points.map((p) => p.value)).toEqual([11299, 18623, 5650]);
    expect(data.series[0].points.map((p) => p.zNumber)).toEqual(['99', '100', '101']);
    expect(data.averageLabel).toBe('Μ.Ο. ανά βάρδια');
    expect(data.average).toBeCloseTo((11299 + 18623 + 5650) / 3, 6);
    expect(data.hiddenDrivers).toBe(0);
  });

  it('διαδρομές ανά βάρδια και μέσος όρος ανά βάρδια', () => {
    const data = buildChartData(items, { metric: 'trips', year: 2026, month: 9, drivers: [A] });
    expect(data.series[0].points.map((p) => p.value)).toEqual([10, 12, 2]);
    expect(data.average).toBe(8);
    expect(data.maxValue).toBe(12);
  });

  it('μέση αξία διαδρομής = (καθαρά + ΦΠΑ) ÷ διαδρομές, χωρίς φιλοδωρήματα', () => {
    const data = buildChartData(items, { metric: 'avgTrip', year: 2026, month: 9, drivers: [A] });
    // Ζ 100: (160,39 + 20,84) ÷ 12 = 15,1025 € — τα 5 € φιλοδωρήματα δεν μετράνε.
    expect(data.series[0].points.map((p) => p.value)).toEqual([1129.9, 1510.25, 2825]);
    // Μέση αξία περιόδου = σύνολο (καθαρά + ΦΠΑ) ÷ σύνολο διαδρομών, όχι μέσος όρος των μέσων όρων.
    expect(data.average).toBeCloseTo((11299 + 18123 + 5650) / 24, 9);
    expect(data.averageLabel).toBe('Μέση αξία περιόδου');
  });

  it('βάρδια χωρίς διαδρομές: κενό στη μέση αξία, όχι μηδέν', () => {
    const data = buildChartData([shift('a', '1', { netRevenue: 40, trips: 0 })], {
      metric: 'avgTrip',
      year: 2026,
      month: 9,
      drivers: [A],
    });
    expect(data.series[0].points[0].value).toBeNull();
    expect(data.average).toBeNull();
    expect(data.maxValue).toBe(0);
  });

  it('χωρίς βάρδιες: άδειο γράφημα', () => {
    const data = buildChartData([], { metric: 'gross', year: 2026, month: 9, drivers: [A] });
    expect(data.series).toEqual([]);
    expect(data.xLabels).toEqual([]);
    expect(data.average).toBeNull();
    expect(data.maxValue).toBe(0);
  });
});

describe('buildChartData — πολλοί οδηγοί', () => {
  const items = [
    shift('b', '7', { netRevenue: 80, trips: 4 }),
    shift('a', '501', { netRevenue: 100, trips: 10 }),
    shift('b', '6', { netRevenue: 90, trips: 5 }),
    shift('a', '502', { netRevenue: 110, trips: 11 }),
    shift('a', '503', { netRevenue: 120, trips: 12 }),
  ];

  it('μία γραμμή ανά οδηγό, με α/α βάρδιας στον άξονα', () => {
    const data = buildChartData(items, { metric: 'trips', year: 2026, month: 9, drivers: [B, A] });
    expect(data.series.map((s) => s.driverId)).toEqual(['a', 'b']);
    expect(data.series.map((s) => s.color)).toEqual([0, 1]);
    expect(data.xLabels).toEqual(['1', '2', '3']);
    expect(data.xTitles[0]).toBe('1η βάρδια του μήνα');
    expect(data.series[0].points.map((p) => p.value)).toEqual([10, 11, 12]);
    // Ο Β έχει 2 βάρδιες (Ζ 6, Ζ 7): η 3η θέση μένει κενή.
    expect(data.series[1].points.map((p) => p.value)).toEqual([5, 4, null]);
    expect(data.series[1].points.map((p) => p.zNumber)).toEqual(['6', '7', null]);
    expect(data.average).toBe(42 / 5);
  });

  it('το χρώμα ακολουθεί τον οδηγό και όταν φιλτράρεται μόνος του', () => {
    const onlyB = items.filter((item) => item.row.driver_id === 'b');
    const data = buildChartData(onlyB, { metric: 'gross', year: 2026, month: 9, drivers: [A, B] });
    expect(data.series).toHaveLength(1);
    expect(data.series[0].color).toBe(1);
    expect(data.xLabels).toEqual(['6', '7']);
  });

  it('οδηγός που δεν έχει φορτωθεί ακόμη: μετά τους γνωστούς, χωρίς όνομα', () => {
    const data = buildChartData([...items, shift('zz', '1', { netRevenue: 10, trips: 1 })], {
      metric: 'trips',
      year: 2026,
      month: 9,
      drivers: [A, B],
    });
    expect(data.series.at(-1)).toMatchObject({ driverId: 'zz', name: '—', color: 2 });
  });

  it(`το πολύ ${MAX_SERIES} γραμμές: κρατά όσους έχουν μεγαλύτερο τζίρο`, () => {
    const drivers = Array.from({ length: MAX_SERIES + 1 }, (_, index) => ({
      id: `d${index}`,
      name: `ΟΔΗΓΟΣ ${index}`,
      created_at: `2026-01-${String(index + 1).padStart(2, '0')}T00:00:00Z`,
    }));
    // Ο πρώτος οδηγός (d0) έχει τον μικρότερο τζίρο.
    const many = drivers.map((driver, index) => shift(driver.id, '1', { netRevenue: 10 + index * 10, trips: 1 }));
    const data = buildChartData(many, { metric: 'gross', year: 2026, month: 9, drivers });
    expect(data.series).toHaveLength(MAX_SERIES);
    expect(data.hiddenDrivers).toBe(1);
    expect(data.series.map((s) => s.driverId)).not.toContain('d0');
    expect(data.series.map((s) => s.color)).toEqual([1, 2, 3, 4, 5, 6]);
    // Ο μέσος όρος καλύπτει και τον οδηγό που δεν σχεδιάζεται.
    const total = many.reduce((sum, item) => sum + item.figures.grossReceiptsCents, 0);
    expect(data.average).toBeCloseTo(total / many.length, 9);
  });
});

describe('buildChartData — όλοι οι μήνες', () => {
  const items = [
    shift('a', '10', { netRevenue: 100, trips: 10 }, 1),
    shift('a', '11', { netRevenue: 100, trips: 6 }, 1),
    shift('a', '40', { netRevenue: 200, trips: 20 }, 3),
  ];

  it('ένα σημείο ανά μήνα (Ιαν–Δεκ), κενό όπου δεν υπάρχουν βάρδιες', () => {
    const data = buildChartData(items, { metric: 'trips', year: 2026, month: 'all', drivers: [A] });
    expect(data.mode).toBe('months');
    expect(data.xLabels).toHaveLength(12);
    expect(data.xLabels[0]).toBe('Ιαν');
    expect(data.xTitles[2]).toBe('Μάρτιος 2026');
    const points = data.series[0].points;
    expect(points.map((p) => p.value)).toEqual([16, null, 20, null, null, null, null, null, null, null, null, null]);
    expect(points[0].shifts).toBe(2);
    expect(points[0].zNumber).toBeNull();
    expect(data.averageLabel).toBe('Μ.Ο. ανά μήνα');
    expect(data.average).toBe(18);
  });

  it('τζίρος ανά μήνα = άθροισμα των βαρδιών του μήνα', () => {
    const data = buildChartData(items, { metric: 'gross', year: 2026, month: 'all', drivers: [A] });
    const expected = items[0].figures.grossReceiptsCents + items[1].figures.grossReceiptsCents;
    expect(data.series[0].points[0].value).toBe(expected);
  });

  it('με πολλούς οδηγούς ο μέσος όρος είναι ανά οδηγό και μήνα', () => {
    const data = buildChartData([...items, shift('b', '1', { netRevenue: 50, trips: 5 }, 3)], {
      metric: 'trips',
      year: 2026,
      month: 'all',
      drivers: [A, B],
    });
    expect(data.series).toHaveLength(2);
    expect(data.averageLabel).toBe('Μ.Ο. ανά οδηγό και μήνα');
    expect(data.average).toBe((16 + 20 + 5) / 3);
  });
});

describe('niceTicks', () => {
  it('στρογγυλά βήματα από το 0', () => {
    expect(niceTicks(31_500)).toEqual([0, 10_000, 20_000, 30_000, 40_000]);
    expect(niceTicks(1_623)).toEqual([0, 500, 1_000, 1_500, 2_000]);
    expect(niceTicks(900)).toEqual([0, 250, 500, 750, 1_000]);
    expect(niceTicks(15.75, { integer: true })).toEqual([0, 5, 10, 15, 20]);
  });

  it('ακέραια μεγέθη: τουλάχιστον βήμα 1', () => {
    expect(niceTicks(0.5, { integer: true })).toEqual([0, 1]);
    expect(niceTicks(0, { integer: true })).toEqual([0, 1]);
    expect(niceTicks(3, { integer: true })).toEqual([0, 1, 2, 3]);
  });

  it('η τελευταία υποδιαίρεση καλύπτει πάντα το μέγιστο', () => {
    for (const max of [1, 7, 12.6, 99, 101, 2_345, 18_623, 147_070]) {
      const ticks = niceTicks(max);
      expect(ticks[0]).toBe(0);
      expect(ticks.at(-1)).toBeGreaterThanOrEqual(max);
      expect(ticks.length).toBeLessThanOrEqual(6);
    }
  });
});

it('isChartMetric', () => {
  expect(isChartMetric('gross')).toBe(true);
  expect(isChartMetric('avgTrip')).toBe(true);
  expect(isChartMetric('netCash')).toBe(false);
  expect(isChartMetric(undefined)).toBe(false);
});
