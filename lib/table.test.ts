import { describe, expect, it } from 'vitest';
import { computeShift, type ShiftInput } from './accounting';
import type { ChartDriver, ChartShift } from './chart';
import {
  averageTripCents,
  buildShiftTable,
  monthRowsFromShifts,
  monthRowsFromSummary,
  sumFigures,
  sumRows,
} from './table';

const A: ChartDriver = { id: 'a', name: 'ΑΛΕΞΗΣ', created_at: '2026-01-01T08:00:00Z' };
const B: ChartDriver = { id: 'b', name: 'ΒΑΣΙΛΗΣ', created_at: '2026-02-01T08:00:00Z' };

let seq = 0;
function shift(driverId: string, zNumber: string, input: Partial<ShiftInput>, month = 9): ChartShift {
  seq += 1;
  return {
    row: { id: `s${seq}`, driver_id: driverId, z_number: zNumber, month, created_at: `2026-09-10T10:${String(seq % 60).padStart(2, '0')}:00Z` },
    figures: computeShift({ trips: 0, paidKm: 0, emptyKm: 0, netRevenue: 0, tips: 0, fuel: 0, otherExpenses: 0, repairs: 0, ...input }),
  };
}

describe('σύνολα πίνακα', () => {
  it('τζίρος με φιλοδωρήματα, μέση αξία διαδρομής χωρίς φιλοδωρήματα', () => {
    // 160,39 € καθαρά → ΦΠΑ 20,84 € · φιλοδωρήματα 5 € · 12 διαδρομές
    const totals = sumFigures([shift('a', '1', { netRevenue: 160.39, tips: 5, trips: 12 }).figures]);
    expect(totals).toEqual({ shifts: 1, grossCents: 18623, trips: 12, fareCents: 18123 });
    expect(averageTripCents(totals)).toBe(1510.25);
  });

  it('χωρίς διαδρομές δεν υπάρχει μέση αξία', () => {
    expect(averageTripCents(sumFigures([shift('a', '1', { netRevenue: 20 }).figures]))).toBeNull();
    expect(averageTripCents(sumFigures([]))).toBeNull();
  });
});

describe('buildShiftTable', () => {
  it('ένας οδηγός, ένας μήνας: μόνο βάρδιες, με αριθμητική σειρά Ζ', () => {
    const items = [
      shift('a', '100', { netRevenue: 100, trips: 10 }),
      shift('a', '99', { netRevenue: 50, trips: 4 }),
      shift('a', '101', { netRevenue: 80, trips: 6 }),
    ];
    const { entries, total } = buildShiftTable(items, { month: 9, drivers: [A] });
    expect(entries.map((e) => e.kind)).toEqual(['shift', 'shift', 'shift']);
    expect(entries.map((e) => (e.kind === 'shift' ? e.zNumber : ''))).toEqual(['99', '100', '101']);
    expect(total.shifts).toBe(3);
    expect(total.trips).toBe(20);
    expect(total.grossCents).toBe(items.reduce((sum, item) => sum + item.figures.grossReceiptsCents, 0));
  });

  it('πολλοί οδηγοί: επικεφαλίδα ανά οδηγό, με τη σειρά του στόλου', () => {
    const items = [
      shift('b', '7', { netRevenue: 80, trips: 4 }),
      shift('a', '501', { netRevenue: 100, trips: 10 }),
      shift('b', '6', { netRevenue: 90, trips: 5 }),
    ];
    const { entries } = buildShiftTable(items, { month: 9, drivers: [B, A] });
    expect(entries.map((e) => (e.kind === 'group' ? `[${e.label}:${e.shifts}]` : e.zNumber))).toEqual([
      '[ΑΛΕΞΗΣ:1]',
      '501',
      '[ΒΑΣΙΛΗΣ:2]',
      '6',
      '7',
    ]);
  });

  it('όλοι οι μήνες: επικεφαλίδα ανά μήνα (και οδηγό, αν είναι πολλοί)', () => {
    const items = [
      shift('a', '20', { netRevenue: 10, trips: 1 }, 9),
      shift('a', '10', { netRevenue: 10, trips: 1 }, 8),
      shift('b', '5', { netRevenue: 10, trips: 1 }, 8),
    ];
    const single = buildShiftTable(items.slice(0, 2), { month: 'all', drivers: [A, B] });
    expect(single.entries.filter((e) => e.kind === 'group').map((e) => e.label)).toEqual(['Αύγουστος', 'Σεπτέμβριος']);
    const multi = buildShiftTable(items, { month: 'all', drivers: [A, B] });
    expect(multi.entries.filter((e) => e.kind === 'group').map((e) => e.label)).toEqual([
      'Αύγουστος · ΑΛΕΞΗΣ',
      'Αύγουστος · ΒΑΣΙΛΗΣ',
      'Σεπτέμβριος · ΑΛΕΞΗΣ',
    ]);
  });
});

describe('ανά μήνα', () => {
  it('από τις βάρδιες: μόνο μήνες με βάρδιες, με σειρά Ιαν→Δεκ', () => {
    const rows = monthRowsFromShifts([
      shift('a', '3', { netRevenue: 100, trips: 10 }, 9),
      shift('a', '1', { netRevenue: 100, trips: 6 }, 1),
      shift('b', '2', { netRevenue: 50, trips: 4 }, 9),
    ]);
    expect(rows.map((r) => [r.month, r.totals.shifts, r.totals.trips])).toEqual([
      [1, 1, 6],
      [9, 2, 14],
    ]);
    expect(sumRows(rows)).toMatchObject({ shifts: 3, trips: 20 });
  });

  it('από τα σύνολα της βάσης: άθροισμα όλων των οδηγών ανά μήνα', () => {
    const rows = monthRowsFromSummary([
      { month: 8, shifts: 20, trips: 240, net_revenue: 3500.5, vat: 454.83, gross_receipts: 4015.33 },
      { month: 9, shifts: 7, trips: 86, net_revenue: 1176.79, vat: 152.91, gross_receipts: 1470.7 },
      { month: 8, shifts: 1, trips: 9, net_revenue: 100, vat: 12.99, gross_receipts: 112.99 },
      { month: null, shifts: null, trips: null, net_revenue: null, vat: null, gross_receipts: null },
    ]);
    expect(rows).toEqual([
      { month: 8, totals: { shifts: 21, grossCents: 412832, trips: 249, fareCents: 350050 + 45483 + 10000 + 1299 } },
      { month: 9, totals: { shifts: 7, grossCents: 147070, trips: 86, fareCents: 117679 + 15291 } },
    ]);
    // Σεπτέμβριος: (1.176,79 + 152,91) ÷ 86 = 15,46 €
    expect(Math.round(averageTripCents(rows[1].totals)!)).toBe(1546);
  });

  it('ο ανοιχτός μήνας έρχεται από τις βάρδιες της σελίδας (και φεύγει αν δεν έχει πια)', () => {
    const summary = [
      { month: 8, shifts: 1, trips: 5, net_revenue: 50, vat: 6.5, gross_receipts: 56.5 },
      { month: 9, shifts: 1, trips: 5, net_revenue: 50, vat: 6.5, gross_receipts: 56.5 },
    ];
    const items = [shift('a', '1', { netRevenue: 100, trips: 10 }, 9), shift('a', '2', { netRevenue: 100, trips: 10 }, 9)];
    const rows = monthRowsFromSummary(summary, { month: 9, items });
    expect(rows.map((r) => [r.month, r.totals.shifts, r.totals.trips])).toEqual([
      [8, 1, 5],
      [9, 2, 20],
    ]);
    expect(monthRowsFromSummary(summary, { month: 9, items: [] }).map((r) => r.month)).toEqual([8]);
  });
});
