import { describe, expect, it } from 'vitest';
import { computeExpense, computeShift, summarize } from './accounting';
import { buildShiftsCsv, csvFileName, CSV_BOM, type CsvExpense, type CsvShift, type CsvStatement } from './csv';

const figures = computeShift({
  trips: 14,
  paidKm: 80.5,
  emptyKm: 40,
  netRevenue: 160.39,
  tips: 5,
  fuel: 50,
  otherExpenses: 0,
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
    expect(lines[0]).toContain('Καθαρό Ταμείο Βάρδιας (€)');
    expect(lines[0]).not.toContain('Επισκευές');
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
    expect(lines[2]).toContain('ΣΥΝΟΛΑ ΒΑΡΔΙΩΝ');
    expect(csv).toContain('Προς Απόδοση ΦΠΑ (€);11,16;Χρεωστικό');
    expect(csv).toContain('Περίοδος;Σεπτέμβριος 2026');
    expect(csv).not.toContain('ΕΞΟΔΑ ΟΧΗΜΑΤΟΣ');
  });

  it('έξοδα οχήματος: δική τους ενότητα, και μέσα στη σύνοψη της περιόδου', () => {
    const repair = computeExpense(800);
    const expense: CsvExpense = {
      year: 2026,
      month: 9,
      driverName: 'Γιώργος',
      plate: 'ΤΑΕ-1234',
      category: 'Επισκευές / Συντήρηση',
      description: 'Φρένα; δίσκοι',
      createdAt: '2026-09-27T12:44:00Z',
      figures: repair,
    };
    const withExpenses = buildShiftsCsv([row], summarize([figures], [repair]), { period: 'Σεπτ.', driverLabel: 'Γ' }, [
      expense,
    ]);
    expect(withExpenses).toContain('ΕΞΟΔΑ ΟΧΗΜΑΤΟΣ (εκτός βάρδιας)');
    expect(withExpenses).toContain('2026;Σεπτέμβριος;Γιώργος;ΤΑΕ-1234;Επισκευές / Συντήρηση;"Φρένα; δίσκοι";800,00;154,84;');
    expect(withExpenses).toContain('ΣΥΝΟΛΟ ΕΞΟΔΩΝ ΟΧΗΜΑΤΟΣ;;;;800,00;154,84;');
    // Η γραμμή της βάρδιας δεν αλλάζει: ταμείο βάρδιας 136,23 €.
    expect(withExpenses).toContain(';50,00;9,68;11,16;136,23;');
    // Σύνοψη: 50 € καύσιμα + 800 € οχήματος· ΦΠΑ 20,84 − (9,68 + 154,84) = 143,68 € πιστωτικό.
    expect(withExpenses).toContain('Καύσιμα (€);50,00');
    expect(withExpenses).toContain('Έξοδα Οχήματος (€);800,00');
    expect(withExpenses).toContain('Σύνολο Εξόδων (€);850,00');
    expect(withExpenses).toContain('Προς Απόδοση ΦΠΑ (€);143,68;Πιστωτικό');
    expect(withExpenses).toContain('Καθαρό Ταμείο (€);-663,77');
  });

  it('εφαρμογές: δική τους ενότητα, κρατήσεις στα έξοδα, διαδρομές δρόμου στη σύνοψη', () => {
    const uber = { trips: 5, turnoverCents: 6000, commissionCents: 900, commissionVatCents: 0 };
    const statement: CsvStatement = {
      year: 2026,
      month: 9,
      driverName: 'Γιώργος',
      plate: 'ΤΑΕ-1234',
      platform: 'Uber',
      entry: 'Εβδομάδα 7–13 Σεπ',
      isWeek: true,
      trips: 5,
      revenueCents: 6000,
      tipsCents: 4500,
      commissionCents: 900,
      vatCents: 0,
      hasVat: false,
      createdAt: '2026-09-27T12:44:00Z',
    };
    const invoice: CsvStatement = {
      ...statement,
      platform: 'FreeNow',
      entry: 'Τιμολόγιο FN-1',
      isWeek: false,
      trips: 0,
      revenueCents: 0,
      tipsCents: 0,
      commissionCents: 3720,
      vatCents: 720,
      hasVat: true,
    };
    const withApps = buildShiftsCsv(
      [row],
      summarize([figures], [], [uber]),
      { period: 'Σεπτ.', driverLabel: 'Γ' },
      [],
      [statement, invoice],
    );
    expect(withApps).toContain('ΕΦΑΡΜΟΓΕΣ (Uber / FreeNow / Bolt)');
    expect(withApps).toContain(
      '2026;Σεπτέμβριος;Γιώργος;ΤΑΕ-1234;Uber;Εβδομάδα 7–13 Σεπ;5;60,00;45,00;9,00;χωρίς ΦΠΑ;',
    );
    expect(withApps).toContain('2026;Σεπτέμβριος;Γιώργος;ΤΑΕ-1234;FreeNow;Τιμολόγιο FN-1;;;;37,20;7,20;');
    expect(withApps).toContain('Διαδρομές;Συνολικά Έσοδα (€);Φιλοδωρήματα / Quest (€);Κράτηση / Προμήθεια (€)');
    // Σύνολο: έσοδα και κράτηση από τα σύνολα της περιόδου, φιλοδωρήματα/quest από τις εβδομάδες.
    expect(withApps).toContain(';;ΣΥΝΟΛΟ ΕΦΑΡΜΟΓΩΝ;;;κράτηση: τιμολόγιο ή εβδομάδες;5;60,00;45,00;9,00;0,00;');
    expect(withApps).toContain('Έσοδα Εφαρμογών (€);60,00');
    expect(withApps).toContain('Διαδρομές (Ζ);14');
    expect(withApps).toContain('Διαδρομές Εφαρμογών;5');
    expect(withApps).toContain('Διαδρομές Δρόμου;9');
    expect(withApps).toContain('Καύσιμα (€);50,00');
    expect(withApps).toContain('Κρατήσεις Εφαρμογών (€);9,00');
    expect(withApps).toContain('Σύνολο Εξόδων (€);59,00');
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
