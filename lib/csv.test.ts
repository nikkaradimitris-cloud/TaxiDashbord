import { describe, expect, it } from 'vitest';
import { computeShift, summarize } from './accounting';
import { buildShiftsCsv, csvFileName, CSV_BOM, type CsvShift } from './csv';

const figures = computeShift({
  trips: 14,
  paidKm: 80.5,
  emptyKm: 40,
  netRevenue: 160.39,
  tips: 5,
  fuel: 40,
  otherExpenses: 10,
  repairs: 0,
});

const row: CsvShift = {
  year: 2026,
  month: 9,
  driverName: 'Παπαδόπουλος; Γιώργος',
  plate: 'ΤΑΕ-1234',
  zNumber: '=HYPERLINK("x")',
  createdAt: '2026-09-27T12:44:00Z',
  figures,
};

const csv = buildShiftsCsv([row], summarize([figures]), {
  period: 'Σεπτέμβριος 2026',
  driverLabel: 'Όλοι οι οδηγοί',
});
const lines = csv.slice(CSV_BOM.length).split('\r\n');

describe('buildShiftsCsv', () => {
  it('ξεκινά με UTF-8 BOM για σωστά ελληνικά στο Excel', () => {
    expect(csv.startsWith('﻿')).toBe(true);
  });

  it('επικεφαλίδες με ";" (ελληνικό Excel)', () => {
    expect(lines[0].split(';')[0]).toBe('Έτος');
    expect(lines[0]).toContain('ΦΠΑ 13% (€)');
    expect(lines[0]).toContain('Καθαρό Ταμείο (€)');
  });

  it('ποσά με ελληνική υποδιαστολή', () => {
    expect(lines[1]).toContain(';160,39;20,84;5,00;186,23;');
    expect(lines[1]).toContain(';80,5;40;120,5;');
  });

  it('προστατεύει από formulas και ";" μέσα σε κείμενο', () => {
    expect(lines[1]).toContain(`"'=HYPERLINK(""x"")"`);
    expect(lines[1]).toContain('"Παπαδόπουλος; Γιώργος"');
  });

  it('γραμμή συνόλων και σύνοψη ΦΠΑ', () => {
    expect(lines[2]).toContain('ΣΥΝΟΛΑ');
    expect(csv).toContain('Προς Απόδοση ΦΠΑ (€);11,16;Χρεωστικό');
    expect(csv).toContain('Περίοδος;Σεπτέμβριος 2026');
  });

  it('ώρα καταχώρησης σε ώρα Ελλάδας', () => {
    expect(lines[1]).toContain('27/09/2026 15:44');
  });
});

describe('csvFileName', () => {
  it('λατινικό όνομα αρχείου ανά περίοδο', () => {
    expect(csvFileName(2026, 9)).toBe('taxi-fleet-2026-09.csv');
    expect(csvFileName(2026, 'all')).toBe('taxi-fleet-2026.csv');
  });
});
