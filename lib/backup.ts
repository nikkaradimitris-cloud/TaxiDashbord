/**
 * Αντίγραφο ασφαλείας: όλα τα στοιχεία της εφαρμογής σε ένα αρχείο Excel, που ο ιδιοκτήτης κατεβάζει
 * και κρατά έξω από το Supabase (στο δωρεάν πακέτο η Supabase δεν δίνει αντίγραφα για κατέβασμα).
 * Μία καρτέλα για κάθε πίνακα, με ελληνικούς τίτλους για να διαβάζεται· στο τέλος κάθε καρτέλας οι
 * «τεχνικές» στήλες (id, driver_id, …), ώστε από το ίδιο αρχείο να ξαναμπαίνουν όλα σε μια βάση.
 */
import { categoryLabel } from './expenses';
import { formatDateTime, formatInteger } from './format';
import { platformLabel, statementRevenueCents } from './platforms';
import type { DriverRow, ExpenseRow, FleetRow, PlatformRateRow, ProfileRow, ShiftRow, StatementRow } from './types';
import { fuelLabel } from './utilization';
import type { Cell, Sheet, SheetColumn } from './xlsx';

/** Οι πίνακες του αντιγράφου, με τη σειρά που θα ξαναμπαίνουν σε μια βάση. */
export const BACKUP_TABLES = [
  'profiles',
  'fleets',
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

/** «taxi-fleet-antigrafo-2026-09-28.xlsx» (ημερομηνία Ελλάδας). */
export function backupFileName(now: Date): string {
  return `taxi-fleet-antigrafo-${athensDate.format(now)}.xlsx`;
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

// ---------------------------------------------------------------------
// Οι καρτέλες του Excel
// ---------------------------------------------------------------------

/** Σημάδι της μορφής στην καρτέλα «Πληροφορίες» (για την επαναφορά). */
export const BACKUP_SHEETS_FORMAT = 'taxi-fleet-tracker · 3';

type Column<Row> = SheetColumn & { value: (row: Row) => Cell };

function sheet<Row>(name: string, columns: Column<Row>[], rows: readonly Row[]): Sheet {
  return {
    name,
    columns: columns.map(({ header, width, money }) => ({ header, width, money })),
    rows: rows.map((row) => columns.map((column) => column.value(row))),
  };
}

const num = (value: unknown): number | null =>
  value === null || value === undefined || value === '' ? null : Number(value);
const when = (iso: string | null) => (iso ? formatDateTime(iso) : null);
const yesNo = (value: boolean) => (value ? 'Ναι' : 'Όχι');
/** Στήλη χωρίς αλλαγή, με το όνομα της βάσης: χρειάζεται για την επαναφορά. */
const raw = <Row>(key: keyof Row & string): Column<Row> => ({
  header: key,
  width: key.endsWith('_at') ? 26 : 12,
  value: (row) => {
    const value = row[key];
    return value === null || value === undefined ? null : typeof value === 'number' ? value : String(value);
  },
});

export function backupSheets(file: BackupFile): Sheet[] {
  const drivers = file.tables.drivers as DriverRow[];
  const byId = new Map(drivers.map((driver) => [driver.id, driver]));
  const name = (id: string) => byId.get(id)?.name ?? '—';
  const plate = (id: string) => byId.get(id)?.plate ?? null;
  const byText = (a: string, b: string) => a.localeCompare(b, 'el');

  const shifts = [...(file.tables.shifts as ShiftRow[])].sort(
    (a, b) =>
      a.year - b.year ||
      a.month - b.month ||
      byText(name(a.driver_id), name(b.driver_id)) ||
      a.z_number.localeCompare(b.z_number, 'el', { numeric: true }),
  );
  const expenses = [...(file.tables.vehicle_expenses as ExpenseRow[])].sort(
    (a, b) => a.year - b.year || a.month - b.month || a.created_at.localeCompare(b.created_at),
  );
  const statements = [...(file.tables.platform_statements as StatementRow[])].sort(
    (a, b) =>
      a.year - b.year ||
      a.month - b.month ||
      byText(name(a.driver_id), name(b.driver_id)) ||
      a.platform.localeCompare(b.platform) ||
      (a.week_start ?? '9999').localeCompare(b.week_start ?? '9999'),
  );
  const rates = [...(file.tables.platform_rates as PlatformRateRow[])].sort(
    (a, b) => byText(name(a.driver_id), name(b.driver_id)) || a.platform.localeCompare(b.platform),
  );
  const profiles = [...(file.tables.profiles as ProfileRow[])].sort(
    (a, b) => (a.role === b.role ? byText(a.full_name, b.full_name) : a.role === 'admin' ? -1 : 1),
  );
  const fleets = [...(file.tables.fleets as FleetRow[])].sort((a, b) => byText(a.name, b.name));
  const { counts } = file;

  const info: Sheet = {
    name: 'Πληροφορίες',
    header: false,
    columns: [
      { header: '', width: 22 },
      { header: '', width: 90 },
    ],
    rows: [
      ['Αντίγραφο ασφαλείας', 'Taxi Fleet Tracker'],
      ['Ημερομηνία', formatDateTime(file.createdAt)],
      ['Από', file.createdBy],
      ['Στόλος', fleets.map((fleet) => fleet.name).join(', ') || '—'],
      [],
      ['Βάρδιες', counts.shifts],
      ['Έξοδα οχήματος', counts.vehicle_expenses],
      ['Εφαρμογές', counts.platform_statements],
      ['Ποσοστά εφαρμογών', counts.platform_rates],
      ['Οδηγοί', counts.drivers],
      ['Λογαριασμοί', counts.profiles],
      [],
      [
        'Τι είναι',
        'Όλα τα στοιχεία της εφαρμογής, μία καρτέλα για κάθε είδος. Κρατήστε το σε ασφαλές μέρος (π.χ. email στον εαυτό σας ή Google Drive).',
      ],
      [
        'Επαναφορά',
        'Αν χαθούν στοιχεία, από αυτό το αρχείο ξαναμπαίνουν όλα. Μην αλλάζετε και μη σβήνετε στήλες, ιδίως τις τελευταίες με τα αγγλικά ονόματα (id, driver_id κ.λπ.).',
      ],
      ['Μορφή αρχείου', BACKUP_SHEETS_FORMAT],
    ],
  };

  return [
    info,
    sheet<ShiftRow>(
      'Βάρδιες',
      [
        { header: 'Έτος', width: 7, value: (r) => r.year },
        { header: 'Μήνας', width: 7, value: (r) => r.month },
        { header: 'Οδηγός', width: 24, value: (r) => name(r.driver_id) },
        { header: 'Πινακίδα', width: 11, value: (r) => plate(r.driver_id) },
        { header: 'Αριθμός Ζ', width: 10, value: (r) => r.z_number },
        { header: 'Διαδρομές', width: 10, value: (r) => num(r.trips) },
        { header: 'Μισθωμένα χλμ', width: 13, value: (r) => num(r.paid_km) },
        { header: 'Ελεύθερα χλμ', width: 12, value: (r) => num(r.empty_km) },
        { header: 'Καθαρά έσοδα €', width: 14, money: true, value: (r) => num(r.net_revenue) },
        { header: 'ΦΠΑ 13% €', width: 11, money: true, value: (r) => num(r.vat) },
        { header: 'Φιλοδωρήματα €', width: 14, money: true, value: (r) => num(r.tips) },
        { header: 'Μικτή είσπραξη €', width: 15, money: true, value: (r) => num(r.gross_receipts) },
        { header: 'Καύσιμα €', width: 11, money: true, value: (r) => num(r.fuel) },
        { header: 'Άλλες δαπάνες €', width: 14, money: true, value: (r) => num(r.other_expenses) },
        { header: 'Επισκευές €', width: 12, money: true, value: (r) => num(r.repairs) },
        { header: 'Καθαρό ταμείο €', width: 14, money: true, value: (r) => num(r.net_cash) },
        { header: 'Καταχωρήθηκε', width: 17, value: (r) => when(r.created_at) },
        raw('id'),
        raw('driver_id'),
        raw('created_by'),
        raw('created_at'),
        raw('updated_at'),
      ],
      shifts,
    ),
    sheet<ExpenseRow>(
      'Έξοδα οχήματος',
      [
        { header: 'Έτος', width: 7, value: (r) => r.year },
        { header: 'Μήνας', width: 7, value: (r) => r.month },
        { header: 'Αυτοκίνητο', width: 11, value: (r) => plate(r.driver_id) },
        { header: 'Οδηγός', width: 24, value: (r) => name(r.driver_id) },
        { header: 'Είδος', width: 22, value: (r) => categoryLabel(r.category) },
        { header: 'Περιγραφή', width: 28, value: (r) => r.description },
        { header: 'Ποσό με ΦΠΑ €', width: 14, money: true, value: (r) => num(r.amount) },
        { header: 'ΦΠΑ 24% €', width: 11, money: true, value: (r) => num(r.vat) },
        { header: 'Καταχωρήθηκε', width: 17, value: (r) => when(r.created_at) },
        raw('id'),
        raw('driver_id'),
        raw('category'),
        raw('created_by'),
        raw('created_at'),
        raw('updated_at'),
      ],
      expenses,
    ),
    sheet<StatementRow>(
      'Εφαρμογές',
      [
        { header: 'Έτος', width: 7, value: (r) => r.year },
        { header: 'Μήνας', width: 7, value: (r) => r.month },
        { header: 'Αυτοκίνητο', width: 11, value: (r) => plate(r.driver_id) },
        { header: 'Οδηγός', width: 24, value: (r) => name(r.driver_id) },
        { header: 'Εφαρμογή', width: 10, value: (r) => platformLabel(r.platform) },
        { header: 'Καταχώρηση', width: 14, value: (r) => (r.kind === 'week' ? 'Εβδομάδα' : 'Τιμολόγιο μήνα') },
        { header: 'Από', width: 11, value: (r) => r.week_start },
        { header: 'Έως', width: 11, value: (r) => r.week_end },
        { header: 'Διαδρομές', width: 10, value: (r) => num(r.trips) },
        { header: 'Έσοδα €', width: 12, money: true, value: (r) => statementRevenueCents(r) / 100 },
        { header: 'Φιλοδωρήματα / Quest €', width: 20, money: true, value: (r) => num(r.tips) },
        { header: 'Προμήθεια €', width: 12, money: true, value: (r) => num(r.commission) },
        { header: 'ΦΠΑ προμήθειας €', width: 16, money: true, value: (r) => num(r.commission_vat) },
        { header: 'Ποσοστό %', width: 10, value: (r) => num(r.rate_pct) },
        { header: 'ΦΠΑ τιμολογίου %', width: 15, value: (r) => num(r.vat_rate) },
        { header: 'Αριθμός τιμολογίου', width: 17, value: (r) => r.reference },
        { header: 'Καταχωρήθηκε', width: 17, value: (r) => when(r.created_at) },
        raw('id'),
        raw('driver_id'),
        raw('platform'),
        raw('kind'),
        raw('turnover'),
        raw('created_by'),
        raw('created_at'),
        raw('updated_at'),
      ],
      statements,
    ),
    sheet<PlatformRateRow>(
      'Ποσοστά εφαρμογών',
      [
        { header: 'Αυτοκίνητο', width: 11, value: (r) => plate(r.driver_id) },
        { header: 'Οδηγός', width: 24, value: (r) => name(r.driver_id) },
        { header: 'Εφαρμογή', width: 10, value: (r) => platformLabel(r.platform) },
        { header: 'Ποσοστό %', width: 10, value: (r) => num(r.rate_pct) },
        { header: 'ΦΠΑ τιμολογίου %', width: 15, value: (r) => num(r.vat_rate) },
        { header: 'Δουλεύει', width: 9, value: (r) => yesNo(r.active !== false) },
        { header: 'Τελευταία αλλαγή', width: 17, value: (r) => when(r.updated_at) },
        raw('driver_id'),
        raw('platform'),
        raw('active'),
        raw('updated_by'),
        raw('updated_at'),
      ],
      rates,
    ),
    sheet<DriverRow>(
      'Οδηγοί',
      [
        { header: 'Όνομα', width: 24, value: (r) => r.name },
        { header: 'Πινακίδα', width: 11, value: (r) => r.plate },
        { header: 'Καύσιμο', width: 11, value: (r) => (r.fuel ? fuelLabel(r.fuel) : '') },
        { header: 'Κινητό', width: 13, value: (r) => r.phone },
        { header: 'Email', width: 28, value: (r) => r.email },
        { header: 'Ενεργός', width: 9, value: (r) => yesNo(r.active) },
        { header: 'Λογαριασμός', width: 13, value: (r) => (r.user_id ? 'Συνδεδεμένος' : '—') },
        { header: 'Καταχωρήθηκε', width: 17, value: (r) => when(r.created_at) },
        raw('id'),
        raw('fleet_id'),
        raw('user_id'),
        raw('fuel'),
        raw('created_at'),
      ],
      [...drivers].sort((a, b) => byText(a.name, b.name)),
    ),
    sheet<ProfileRow>(
      'Λογαριασμοί',
      [
        { header: 'Όνομα', width: 24, value: (r) => r.full_name },
        { header: 'Email', width: 28, value: (r) => r.email },
        { header: 'Ρόλος', width: 12, value: (r) => (r.role === 'admin' ? 'Ιδιοκτήτης' : 'Οδηγός') },
        { header: 'Email επιβεβαιώθηκε', width: 18, value: (r) => when(r.email_confirmed_at) },
        { header: 'Δημιουργήθηκε', width: 17, value: (r) => when(r.created_at) },
        raw('id'),
        raw('role'),
        raw('email_confirmed_at'),
        raw('created_at'),
      ],
      profiles,
    ),
    sheet<FleetRow>(
      'Στόλος',
      [
        { header: 'Όνομα', width: 24, value: (r) => r.name },
        { header: 'Δημιουργήθηκε', width: 17, value: (r) => when(r.created_at) },
        raw('id'),
        raw('owner_id'),
        raw('created_at'),
      ],
      fleets,
    ),
  ];
}
