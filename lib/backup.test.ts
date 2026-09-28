import { describe, expect, it } from 'vitest';
import { BACKUP_TABLES, backupFileName, backupSummary, buildBackup, isBackupDue, type BackupTables } from './backup';

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
    expect(backupFileName(new Date('2026-09-28T07:00:00Z'))).toBe('taxi-fleet-antigrafo-2026-09-28.json');
    // 23:30 UTC = 02:30 της επόμενης μέρας στην Ελλάδα (θερινή ώρα).
    expect(backupFileName(new Date('2026-09-28T23:30:00Z'))).toBe('taxi-fleet-antigrafo-2026-09-29.json');
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
});
