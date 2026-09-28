import { summarize, VAT_STATUS_LABEL, vatStatus, type ExpenseFigures, type ShiftFigures, type Totals } from './accounting';
import { formatCentsPlain, formatDateTime, formatDecimalPlain } from './format';
import { monthName } from './period';

/**
 * Εξαγωγή για Excel / λογιστή.
 *
 * - UTF-8 με BOM, ώστε το Excel να δείχνει σωστά τα ελληνικά.
 * - Διαχωριστικό ";" και ελληνική υποδιαστολή ",", όπως περιμένει το Excel
 *   με ελληνικές τοπικές ρυθμίσεις (αλλιώς όλα πέφτουν σε μία στήλη).
 * - Βάρδιες (με τα καύσιμα), μετά τα Έξοδα Οχήματος εκτός βάρδιας, και στο
 *   τέλος η σύνοψη της περιόδου (όλα τα έξοδα, ΦΠΑ, ταμείο).
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

  // Σύνοψη περιόδου: βάρδιες + έξοδα οχήματος.
  const status = vatStatus(totals.vatBalanceCents);
  lines.push([textCell('Περίοδος'), textCell(meta.period)]);
  lines.push([textCell('Οδηγός'), textCell(meta.driverLabel)]);
  lines.push([textCell('Βάρδιες'), String(totals.shifts)]);
  lines.push([textCell('Μικτή Είσπραξη (€)'), formatCentsPlain(totals.grossReceiptsCents)]);
  lines.push([textCell('Καύσιμα (€)'), formatCentsPlain(totals.totalExpensesCents - totals.vehicleExpensesCents)]);
  lines.push([textCell('Έξοδα Οχήματος (€)'), formatCentsPlain(totals.vehicleExpensesCents)]);
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
