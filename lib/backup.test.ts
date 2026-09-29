import { describe, expect, it } from 'vitest';
import {
  BACKUP_SHEETS_FORMAT,
  BACKUP_TABLES,
  backupFileName,
  backupSheets,
  backupSummary,
  buildBackup,
  isBackupDue,
  type BackupTables,
} from './backup';

const tables: BackupTables = {
  profiles: [{ id: 'p1' }, { id: 'p2' }],
  drivers: [{ id: 'd1' }],
  platform_rates: [],
  shifts: Array.from({ length: 1234 }, (_, i) => ({ id: `s${i}` })),
  vehicle_expenses: [{ id: 'e1' }, { id: 'e2' }, { id: 'e3' }],
  platform_statements: [{ id: 'x1' }],
};

describe('αντίγραφο ασφαλείας', () => {
  it('κρατά όλους τους πίνακες και μετρά τις γραμμές τους', () => {
    const file = buildBackup(tables, 'owner@example.com', new Date('2026-09-28T07:00:00Z'));
    expect(file.app).toBe('taxi-fleet-tracker');
    expect(file.format).toBe(1);
    expect(file.createdAt).toBe('2026-09-28T07:00:00.000Z');
    expect(file.createdBy).toBe('owner@example.com');
    expect(Object.keys(file.tables)).toEqual([...BACKUP_TABLES]);
    expect(file.counts).toEqual({
      profiles: 2,
      drivers: 1,
      platform_rates: 0,
      shifts: 1234,
      vehicle_expenses: 3,
      platform_statements: 1,
    });
    // Ίδιο περιεχόμενο μετά από αποθήκευση σε αρχείο και ξανά διάβασμα.
    expect(JSON.parse(JSON.stringify(file))).toEqual(file);
  });

  it('όνομα αρχείου με την ημερομηνία Ελλάδας', () => {
    expect(backupFileName(new Date('2026-09-28T07:00:00Z'))).toBe('taxi-fleet-antigrafo-2026-09-28.xlsx');
    // 23:30 UTC = 02:30 της επόμενης μέρας στην Ελλάδα (θερινή ώρα).
    expect(backupFileName(new Date('2026-09-28T23:30:00Z'))).toBe('taxi-fleet-antigrafo-2026-09-29.xlsx');
  });

  it('σύνοψη με ενικό / πληθυντικό και χιλιάδες', () => {
    const file = buildBackup(tables, 'owner@example.com', new Date());
    expect(backupSummary(file.counts)).toBe('1 οδηγός · 1.234 βάρδιες · 3 έξοδα · 1 καταχώρηση εφαρμογών');
    expect(
      backupSummary({ ...file.counts, drivers: 4, vehicle_expenses: 1, platform_statements: 0 }),
    ).toBe('4 οδηγοί · 1.234 βάρδιες · 1 έξοδο · 0 καταχωρήσεις εφαρμογών');
  });

  it('υπενθύμιση: ποτέ ή πάνω από 30 μέρες', () => {
    const now = new Date('2026-09-28T10:00:00Z');
    expect(isBackupDue(null, now)).toBe(true);
    expect(isBackupDue('όχι ημερομηνία', now)).toBe(true);
    expect(isBackupDue('2026-09-27T10:00:00Z', now)).toBe(false);
    expect(isBackupDue('2026-08-29T10:00:00Z', now)).toBe(false); // ακριβώς 30 μέρες
    expect(isBackupDue('2026-08-29T09:59:00Z', now)).toBe(true);
    expect(isBackupDue('2026-07-01T10:00:00Z', now)).toBe(true);
  });

  it('Excel: μία καρτέλα ανά πίνακα, ελληνικοί τίτλοι, ονόματα αντί για κωδικούς, όλες οι στήλες για επαναφορά', () => {
    const giorgos = {
      id: 'd1',
      name: 'Γιώργος Παπαδόπουλος',
      plate: 'ΤΑΕ-1234',
      phone: '6912345678',
      email: 'giorgos@example.com',
      active: true,
      user_id: 'u2',
      created_at: '2026-09-01T08:00:00Z',
    };
    const file = buildBackup(
      {
        profiles: [
          { id: 'u2', email: 'giorgos@example.com', full_name: 'Γιώργος Π.', role: 'driver', email_confirmed_at: null, created_at: '2026-09-02T08:00:00Z' },
          { id: 'u1', email: 'owner@example.com', full_name: 'Νίκος', role: 'admin', email_confirmed_at: '2026-09-01T08:00:00Z', created_at: '2026-09-01T08:00:00Z' },
        ],
        drivers: [giorgos],
        platform_rates: [
          { driver_id: 'd1', platform: 'freenow', rate_pct: 12, vat_rate: 24, updated_by: 'u1', updated_at: '2026-09-03T08:00:00Z' },
        ],
        shifts: [
          { id: 's2', driver_id: 'd1', year: 2026, month: 9, z_number: '102', trips: 11, paid_km: 70, empty_km: 30, net_revenue: 120, vat: 15.59, tips: 0, gross_receipts: 135.59, fuel: 35, other_expenses: 0, repairs: 0, net_cash: 100.59, created_by: 'u2', created_at: '2026-09-05T20:00:00Z', updated_at: '2026-09-05T20:00:00Z' },
          { id: 's1', driver_id: 'd1', year: 2026, month: 9, z_number: '101', trips: 14, paid_km: 80.5, empty_km: 40, net_revenue: 160.39, vat: 20.84, tips: 5, gross_receipts: 186.23, fuel: 40, other_expenses: 0, repairs: 0, net_cash: 146.23, created_by: 'u1', created_at: '2026-09-04T20:00:00Z', updated_at: '2026-09-04T20:00:00Z' },
        ],
        vehicle_expenses: [
          { id: 'e1', driver_id: 'd1', year: 2026, month: 9, category: 'repairs', description: 'Φρένα', amount: 124, vat: 24, created_by: 'u1', created_at: '2026-09-06T08:00:00Z', updated_at: '2026-09-06T08:00:00Z' },
        ],
        platform_statements: [
          { id: 'p1', driver_id: 'd1', year: 2026, month: 9, platform: 'freenow', kind: 'week', week_start: '2026-09-21', week_end: '2026-09-27', trips: 46, turnover: 624.46, tips: 45, commission: 85.14, commission_vat: 16.48, rate_pct: 12, vat_rate: 24, reference: '', created_by: 'u1', created_at: '2026-09-28T08:00:00Z', updated_at: '2026-09-28T08:00:00Z' },
        ],
      },
      'owner@example.com',
      new Date('2026-09-28T07:00:00Z'),
    );
    const sheets = backupSheets(file);
    expect(sheets.map((sheet) => sheet.name)).toEqual([
      'Πληροφορίες',
      'Βάρδιες',
      'Έξοδα οχήματος',
      'Εφαρμογές',
      'Ποσοστά εφαρμογών',
      'Οδηγοί',
      'Λογαριασμοί',
    ]);
    const [info, shifts, expenses, apps, rates, drivers, accounts] = sheets;
    expect(info.rows).toContainEqual(['Ημερομηνία', '28/09/2026 10:00']);
    expect(info.rows).toContainEqual(['Βάρδιες', 2]);
    expect(info.rows).toContainEqual(['Μορφή αρχείου', BACKUP_SHEETS_FORMAT]);

    const column = (sheet: typeof shifts, header: string) => sheet.columns.findIndex((c) => c.header === header);
    // Ταξινόμηση κατά αριθμό Ζ· όνομα και πινακίδα αντί για κωδικό οδηγού· ποσά ως αριθμοί.
    expect(shifts.rows.map((row) => row[column(shifts, 'Αριθμός Ζ')])).toEqual(['101', '102']);
    expect(shifts.rows[0][column(shifts, 'Οδηγός')]).toBe('Γιώργος Παπαδόπουλος');
    expect(shifts.rows[0][column(shifts, 'Πινακίδα')]).toBe('ΤΑΕ-1234');
    expect(shifts.rows[0][column(shifts, 'Καθαρά έσοδα €')]).toBe(160.39);
    expect(shifts.columns[column(shifts, 'Καθαρά έσοδα €')].money).toBe(true);
    expect(shifts.rows[0][column(shifts, 'Καταχωρήθηκε')]).toBe('04/09/2026 23:00');
    // Όλες οι στήλες της βάσης που δεν υπολογίζονται μένουν στο αρχείο (επαναφορά).
    for (const key of ['id', 'driver_id', 'created_by', 'created_at', 'updated_at']) {
      expect(shifts.columns.map((c) => c.header)).toContain(key);
    }
    expect(shifts.rows[0][column(shifts, 'id')]).toBe('s1');

    expect(expenses.rows[0][column(expenses, 'Είδος')]).toBe('Επισκευές / Συντήρηση');
    expect(expenses.rows[0][column(expenses, 'category')]).toBe('repairs');
    expect(apps.rows[0][column(apps, 'Εφαρμογή')]).toBe('FreeNow');
    expect(apps.rows[0][column(apps, 'Έσοδα €')]).toBe(579.46);
    expect(apps.rows[0][column(apps, 'turnover')]).toBe(624.46);
    expect(rates.rows[0][column(rates, 'Ποσοστό %')]).toBe(12);
    expect(drivers.rows[0][column(drivers, 'Ενεργός')]).toBe('Ναι');
    expect(drivers.rows[0][column(drivers, 'Λογαριασμός')]).toBe('Συνδεδεμένος');
    // Πρώτα ο ιδιοκτήτης.
    expect(accounts.rows.map((row) => row[column(accounts, 'Ρόλος')])).toEqual(['Ιδιοκτήτης', 'Οδηγός']);
  });
});
