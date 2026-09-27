import { VAT_STATUS_LABEL, vatStatus, type ShiftFigures, type Totals } from './accounting';
import { formatCentsPlain, formatDateTime, formatDecimalPlain } from './format';
import { monthName } from './period';

/**
 * Εξαγωγή για Excel / λογιστή.
 *
 * - UTF-8 με BOM, ώστε το Excel να δείχνει σωστά τα ελληνικά.
 * - Διαχωριστικό ";" και ελληνική υποδιαστολή ",", όπως περιμένει το Excel
 *   με ελληνικές τοπικές ρυθμίσεις (αλλιώς όλα πέφτουν σε μία στήλη).
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
  'Άλλες Δαπάνες (€)',
  'Επισκευές / Συντήρηση (€)',
  'Σύνολο Εξόδων (€)',
  'ΦΠΑ Εξόδων 24% (€)',
  'Προς Απόδοση ΦΠΑ (€)',
  'Καθαρό Ταμείο (€)',
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
    formatCentsPlain(f.fuelCents),
    formatCentsPlain(f.otherExpensesCents),
    formatCentsPlain(f.repairsCents),
    formatCentsPlain(f.totalExpensesCents),
    formatCentsPlain(f.expensesVatCents),
    formatCentsPlain(f.vatBalanceCents),
    formatCentsPlain(f.netCashCents),
  ];
}

export function buildShiftsCsv(rows: readonly CsvShift[], totals: Totals, meta: CsvMeta): string {
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

  lines.push(['', '', textCell('ΣΥΝΟΛΑ'), '', '', ...figureCells(totals), '']);
  lines.push([]);

  const status = vatStatus(totals.vatBalanceCents);
  lines.push([textCell('Περίοδος'), textCell(meta.period)]);
  lines.push([textCell('Οδηγός'), textCell(meta.driverLabel)]);
  lines.push([textCell('Βάρδιες'), String(totals.shifts)]);
  lines.push([textCell('Αξιοποίηση %'), formatDecimalPlain(totals.utilizationPct, 1)]);
  lines.push([textCell('Έσοδο ανά χλμ (€)'), formatDecimalPlain(totals.revenuePerKm, 2)]);
  lines.push([
    textCell('Προς Απόδοση ΦΠΑ (€)'),
    formatCentsPlain(Math.abs(totals.vatBalanceCents)),
    textCell(VAT_STATUS_LABEL[status]),
  ]);

  return CSV_BOM + lines.map((cells) => cells.join(SEPARATOR)).join(NEWLINE) + NEWLINE;
}

/** Όνομα αρχείου μόνο με λατινικούς χαρακτήρες (ασφαλές σε όλα τα συστήματα). */
export function csvFileName(year: number, month: number | 'all'): string {
  const period = month === 'all' ? `${year}` : `${year}-${String(month).padStart(2, '0')}`;
  return `taxi-fleet-${period}.csv`;
}
