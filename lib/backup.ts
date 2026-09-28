/**
 * Αντίγραφο ασφαλείας: όλα τα στοιχεία της εφαρμογής σε ένα αρχείο JSON, που ο ιδιοκτήτης κατεβάζει
 * και κρατά έξω από το Supabase (στο δωρεάν πακέτο η Supabase δεν δίνει αντίγραφα για κατέβασμα).
 * Από αυτό το αρχείο μπορούν να ξαναμπούν όλα τα στοιχεία σε μια βάση.
 */
import { formatInteger } from './format';

/** Οι πίνακες του αντιγράφου, με τη σειρά που θα ξαναμπαίνουν σε μια βάση. */
export const BACKUP_TABLES = [
  'profiles',
  'drivers',
  'platform_rates',
  'shifts',
  'vehicle_expenses',
  'platform_statements',
] as const;
export type BackupTable = (typeof BACKUP_TABLES)[number];
export type BackupTables = Record<BackupTable, readonly unknown[]>;

export interface BackupFile {
  app: 'taxi-fleet-tracker';
  /** Έκδοση της μορφής του αρχείου. */
  format: 1;
  createdAt: string;
  createdBy: string;
  counts: Record<BackupTable, number>;
  tables: BackupTables;
}

/** Υπενθύμιση όταν το τελευταίο αντίγραφο είναι παλιότερο από τόσες μέρες (ή δεν έγινε ποτέ). */
export const BACKUP_REMINDER_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export function buildBackup(tables: BackupTables, createdBy: string, now: Date): BackupFile {
  const counts = Object.fromEntries(BACKUP_TABLES.map((table) => [table, tables[table].length])) as Record<
    BackupTable,
    number
  >;
  return { app: 'taxi-fleet-tracker', format: 1, createdAt: now.toISOString(), createdBy, counts, tables };
}

const athensDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Athens',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** «taxi-fleet-antigrafo-2026-09-28.json» (ημερομηνία Ελλάδας). */
export function backupFileName(now: Date): string {
  return `taxi-fleet-antigrafo-${athensDate.format(now)}.json`;
}

const plural = (count: number, one: string, many: string) => `${formatInteger(count)} ${count === 1 ? one : many}`;

/** «4 οδηγοί · 1.234 βάρδιες · 3 έξοδα · 5 καταχωρήσεις εφαρμογών» */
export function backupSummary(counts: Record<BackupTable, number>): string {
  return [
    plural(counts.drivers, 'οδηγός', 'οδηγοί'),
    plural(counts.shifts, 'βάρδια', 'βάρδιες'),
    plural(counts.vehicle_expenses, 'έξοδο', 'έξοδα'),
    plural(counts.platform_statements, 'καταχώρηση εφαρμογών', 'καταχωρήσεις εφαρμογών'),
  ].join(' · ');
}

/** Χρειάζεται νέο αντίγραφο: δεν έγινε ποτέ ή έχουν περάσει πάνω από 30 μέρες. */
export function isBackupDue(lastBackupAt: string | null, now: Date): boolean {
  if (!lastBackupAt) return true;
  const last = Date.parse(lastBackupAt);
  if (Number.isNaN(last)) return true;
  return now.getTime() - last > BACKUP_REMINDER_DAYS * DAY_MS;
}
