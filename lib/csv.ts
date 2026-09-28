import { summarize, VAT_STATUS_LABEL, vatStatus, type ExpenseFigures, type ShiftFigures, type Totals } from './accounting';
import { formatCentsPlain, formatDateTime, formatDecimalPlain } from './format';
import { monthName } from './period';

/**
 * Εξαγωγή για Excel / λογιστή.
 *
 * - UTF-8 με BOM, ώστε το Excel να δείχνει σωστά τα ελληνικά.
 * - Διαχωριστικό ";" και ελληνική υποδιαστολή ",", όπως περιμένει το Excel
 *   με ελληνικές τοπικές ρυθμίσεις (αλλιώς όλα πέφτουν σε μία στήλη).
 * - Βάρδιες (με τα καύσιμα), μετά τα Έξοδα Οχήματος εκτός βάρδιας, οι
 *   Εφαρμογές (εβδομάδες / τιμολόγια), και στο τέλος η σύνοψη της περιόδου
 *   (όλα τα έξοδα, ΦΠΑ, ταμείο, διαδρομές δρόμου / εφαρμογών).
 */
export const CSV_BOM = '﻿';
const SEPARATOR = ';';
const NEWLINE = '\r\n';

export interface CsvShift {
  year: number;
  month: number;
  driverName: string;
  plate: string | null;
  zNumber: string;
  createdAt: string;
  figures: ShiftFigures;
}

export interface CsvExpense {
  year: number;
  month: number;
  driverName: string;
  plate: string | null;
  category: string;
  description: string;
  createdAt: string;
  figures: ExpenseFigures;
}

/** Καταχώρηση εφαρμογής: εβδομάδα (διαδρομές, τζίρος, κράτηση) ή τιμολόγιο μήνα. */
export interface CsvStatement {
  year: number;
  month: number;
  driverName: string;
  plate: string | null;
  platform: string;
  /** «Εβδομάδα 7–13 Σεπ» ή «Τιμολόγιο FN-123». */
  entry: string;
  isWeek: boolean;
  trips: number;
  turnoverCents: number;
  commissionCents: number;
  vatCents: number;
  /** false: η εφαρμογή τιμολογεί χωρίς ΦΠΑ (Uber). */
  hasVat: boolean;
  createdAt: string;
}

export interface CsvMeta {
  period: string;
  driverLabel: string;
}

const HEADERS = [
  'Έτος',
  'Μήνας',
  'Οδηγός',
  'Πινακίδα',
  'Αρ. Ζ',
  'Διαδρομές',
  'Μισθωμένα Χλμ',
  'Ελεύθερα Χλμ',
  'Συνολικά Χλμ',
  'Καθαρά Έσοδα (€)',
  'ΦΠΑ 13% (€)',
  'Φιλοδωρήματα / Άλλα Έσοδα (€)',
  'Μικτή Είσπραξη (€)',
  'Καύσιμα (€)',
  'ΦΠΑ Καυσίμων 24% (€)',
  'Υπόλοιπο ΦΠΑ Βάρδιας (€)',
  'Καθαρό Ταμείο Βάρδιας (€)',
  'Καταχώρηση',
];

const EXPENSE_HEADERS = [
  'Έτος',
  'Μήνας',
  'Οδηγός',
  'Πινακίδα',
  'Κατηγορία',
  'Περιγραφή',
  'Ποσό με ΦΠΑ (€)',
  'ΦΠΑ 24% (€)',
  'Καταχώρηση',
];

const STATEMENT_HEADERS = [
  'Έτος',
  'Μήνας',
  'Οδηγός',
  'Πινακίδα',
  'Εφαρμογή',
  'Καταχώρηση',
  'Διαδρομές',
  'Τζίρος (€)',
  'Κράτηση (€)',
  'ΦΠΑ Κράτησης 24% (€)',
  'Καταχωρήθηκε',
];

/** Κείμενο κελιού: προστασία από formulas (=, +, -, @) και σωστά εισαγωγικά. */
function textCell(value: string): string {
  let text = value;
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[";\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

function figureCells(f: ShiftFigures): string[] {
  return [
    String(f.trips),
    formatDecimalPlain(f.paidKm),
    formatDecimalPlain(f.emptyKm),
    formatDecimalPlain(f.totalKm),
    formatCentsPlain(f.netRevenueCents),
    formatCentsPlain(f.vatCents),
    formatCentsPlain(f.tipsCents),
    formatCentsPlain(f.grossReceiptsCents),
    // Τα έξοδα της βάρδιας είναι τα καύσιμα (επισκευές κ.λπ. είναι «Έξοδα Οχήματος»).
    formatCentsPlain(f.totalExpensesCents),
    formatCentsPlain(f.expensesVatCents),
    formatCentsPlain(f.vatBalanceCents),
    formatCentsPlain(f.netCashCents),
  ];
}

export function buildShiftsCsv(
  rows: readonly CsvShift[],
  totals: Totals,
  meta: CsvMeta,
  expenses: readonly CsvExpense[] = [],
  statements: readonly CsvStatement[] = [],
): string {
  const lines: string[][] = [HEADERS.map(textCell)];

  for (const row of rows) {
    lines.push([
      String(row.year),
      textCell(monthName(row.month)),
      textCell(row.driverName),
      textCell(row.plate ?? ''),
      textCell(row.zNumber),
      ...figureCells(row.figures),
      textCell(formatDateTime(row.createdAt)),
    ]);
  }

  const shiftTotals = summarize(rows.map((row) => row.figures));
  lines.push(['', '', textCell('ΣΥΝΟΛΑ ΒΑΡΔΙΩΝ'), '', '', ...figureCells(shiftTotals), '']);
  lines.push([]);

  if (expenses.length > 0) {
    lines.push([textCell('ΕΞΟΔΑ ΟΧΗΜΑΤΟΣ (εκτός βάρδιας)')]);
    lines.push(EXPENSE_HEADERS.map(textCell));
    let amountCents = 0;
    let vatCents = 0;
    for (const expense of expenses) {
      amountCents += expense.figures.amountCents;
      vatCents += expense.figures.vatCents;
      lines.push([
        String(expense.year),
        textCell(monthName(expense.month)),
        textCell(expense.driverName),
        textCell(expense.plate ?? ''),
        textCell(expense.category),
        textCell(expense.description),
        formatCentsPlain(expense.figures.amountCents),
        formatCentsPlain(expense.figures.vatCents),
        textCell(formatDateTime(expense.createdAt)),
      ]);
    }
    lines.push(['', '', textCell('ΣΥΝΟΛΟ ΕΞΟΔΩΝ ΟΧΗΜΑΤΟΣ'), '', '', '', formatCentsPlain(amountCents), formatCentsPlain(vatCents), '']);
    lines.push([]);
  }

  if (statements.length > 0) {
    lines.push([textCell('ΕΦΑΡΜΟΓΕΣ (Uber / FreeNow)')]);
    lines.push(STATEMENT_HEADERS.map(textCell));
    for (const statement of statements) {
      lines.push([
        String(statement.year),
        textCell(monthName(statement.month)),
        textCell(statement.driverName),
        textCell(statement.plate ?? ''),
        textCell(statement.platform),
        textCell(statement.entry),
        statement.isWeek ? String(statement.trips) : '',
        statement.isWeek ? formatCentsPlain(statement.turnoverCents) : '',
        formatCentsPlain(statement.commissionCents),
        statement.hasVat ? formatCentsPlain(statement.vatCents) : textCell('χωρίς ΦΠΑ'),
        textCell(formatDateTime(statement.createdAt)),
      ]);
    }
    // Οι κρατήσεις που μετράνε: το τιμολόγιο του μήνα όπου υπάρχει, αλλιώς οι εβδομάδες.
    lines.push([
      '',
      '',
      textCell('ΣΥΝΟΛΟ ΕΦΑΡΜΟΓΩΝ'),
      '',
      '',
      textCell('κράτηση: τιμολόγιο ή εβδομάδες'),
      String(totals.appTrips),
      formatCentsPlain(totals.appTurnoverCents),
      formatCentsPlain(totals.appCommissionCents),
      formatCentsPlain(totals.appCommissionVatCents),
      '',
    ]);
    lines.push([]);
  }

  // Σύνοψη περιόδου: βάρδιες + έξοδα οχήματος + εφαρμογές.
  const status = vatStatus(totals.vatBalanceCents);
  lines.push([textCell('Περίοδος'), textCell(meta.period)]);
  lines.push([textCell('Οδηγός'), textCell(meta.driverLabel)]);
  lines.push([textCell('Βάρδιες'), String(totals.shifts)]);
  lines.push([textCell('Διαδρομές (Ζ)'), String(totals.trips)]);
  lines.push([textCell('Διαδρομές Εφαρμογών'), String(totals.appTrips)]);
  lines.push([textCell('Διαδρομές Δρόμου'), String(totals.streetTrips)]);
  lines.push([textCell('Μικτή Είσπραξη (€)'), formatCentsPlain(totals.grossReceiptsCents)]);
  lines.push([textCell('Τζίρος Εφαρμογών (€)'), formatCentsPlain(totals.appTurnoverCents)]);
  lines.push([textCell('Καύσιμα (€)'), formatCentsPlain(totals.fuelCents)]);
  lines.push([textCell('Έξοδα Οχήματος (€)'), formatCentsPlain(totals.vehicleExpensesCents)]);
  lines.push([textCell('Κρατήσεις Εφαρμογών (€)'), formatCentsPlain(totals.appCommissionCents)]);
  lines.push([textCell('Σύνολο Εξόδων (€)'), formatCentsPlain(totals.totalExpensesCents)]);
  lines.push([textCell('ΦΠΑ Εσόδων 13% (€)'), formatCentsPlain(totals.vatCents)]);
  lines.push([textCell('ΦΠΑ Εξόδων 24% (€)'), formatCentsPlain(totals.expensesVatCents)]);
  lines.push([
    textCell('Προς Απόδοση ΦΠΑ (€)'),
    formatCentsPlain(Math.abs(totals.vatBalanceCents)),
    textCell(VAT_STATUS_LABEL[status]),
  ]);
  lines.push([textCell('Καθαρό Ταμείο (€)'), formatCentsPlain(totals.netCashCents)]);
  lines.push([textCell('Αξιοποίηση %'), formatDecimalPlain(totals.utilizationPct, 1)]);
  lines.push([textCell('Έσοδο ανά χλμ (€)'), formatDecimalPlain(totals.revenuePerKm, 2)]);

  return CSV_BOM + lines.map((cells) => cells.join(SEPARATOR)).join(NEWLINE) + NEWLINE;
}

/** Όνομα αρχείου μόνο με λατινικούς χαρακτήρες (ασφαλές σε όλα τα συστήματα). */
export function csvFileName(year: number, month: number | 'all'): string {
  const period = month === 'all' ? `${year}` : `${year}-${String(month).padStart(2, '0')}`;
  return `taxi-fleet-${period}.csv`;
}
