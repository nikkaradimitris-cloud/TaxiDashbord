import { VAT_STATUS_LABEL, vatStatus, type Totals } from './accounting';
import { formatEuro } from './format';
import { periodLabel, type MonthFilter } from './period';

/**
 * Κινητό σε μορφή wa.me (διεθνής μορφή χωρίς "+" και "00").
 * "69XXXXXXXX" → "3069XXXXXXXX". Δέχεται και "+30 69...", "0030 69...".
 */
export function toWhatsAppNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  // Ελληνικός 10ψήφιος αριθμός (κινητό 69..., σταθερό 2...) → πρόθεμα χώρας 30.
  if (digits.length === 10 && /^[26]/.test(digits)) digits = `30${digits}`;
  if (digits.length < 11 || digits.length > 15) return null;
  return digits;
}

export interface VatMessageInput {
  driverName: string;
  plate: string | null;
  year: number;
  month: MonthFilter;
  totals: Totals;
}

/** Προσυμπληρωμένο κείμενο ενημέρωσης ΦΠΑ για WhatsApp. */
export function buildVatMessage({ driverName, plate, year, month, totals }: VatMessageInput): string {
  const status = vatStatus(totals.vatBalanceCents);
  return [
    '*Ενημέρωση ΦΠΑ – Taxi Fleet*',
    `Οδηγός: ${driverName}`,
    `Όχημα: ${plate || '-'}`,
    `${month === 'all' ? 'Περίοδος' : 'Μήνας'}: ${periodLabel(year, month)}`,
    '',
    `Είσπραξη (μικτή): ${formatEuro(totals.grossReceiptsCents)}`,
    `Έξοδα: ${formatEuro(totals.totalExpensesCents)}`,
    `ΦΠΑ εσόδων 13%: ${formatEuro(totals.vatCents)}`,
    `ΦΠΑ εξόδων 24%: ${formatEuro(totals.expensesVatCents)}`,
    `*Προς απόδοση ΦΠΑ: ${formatEuro(Math.abs(totals.vatBalanceCents))} (${VAT_STATUS_LABEL[status]})*`,
    `Καθαρό ταμείο: ${formatEuro(totals.netCashCents)}`,
    `Βάρδιες: ${totals.shifts}`,
  ].join('\n');
}

/** Σύνδεσμος wa.me με έτοιμο κείμενο, ή null αν το τηλέφωνο δεν είναι έγκυρο. */
export function whatsappLink(phone: string | null | undefined, text: string): string | null {
  const number = toWhatsAppNumber(phone);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}
