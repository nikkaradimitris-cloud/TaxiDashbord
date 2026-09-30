import { VAT_STATUS_TEXT, vatStatus, type Totals } from './accounting';
import { DISCLAIMER_SHORT } from './disclaimer';
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

/** Τα στοιχεία της κάρτας ΦΠΑ (εικόνα για WhatsApp): μόνο ο ΦΠΑ, με την ένδειξη «ενδεικτικός». */
export function vatCardData({ driverName, plate, year, month, totals }: VatMessageInput) {
  const status = vatStatus(totals.vatBalanceCents);
  return {
    period: periodLabel(year, month),
    car: plate ? `${plate} · ${driverName}` : driverName,
    vatIn: `+ ${formatEuro(totals.vatCents)}`,
    vatOut: `− ${formatEuro(totals.expensesVatCents)}`,
    amount: formatEuro(Math.abs(totals.vatBalanceCents)),
    status,
    statusText: VAT_STATUS_TEXT[status],
    note: DISCLAIMER_SHORT,
  };
}

export type VatCardData = ReturnType<typeof vatCardData>;

/** Σύντομο μήνυμα που συνοδεύει την εικόνα: μόνο ο ΦΠΑ. */
export function buildVatMessage(input: VatMessageInput): string {
  const card = vatCardData(input);
  return [
    `*Προς απόδοση ΦΠΑ · ${card.period}*`,
    card.car,
    `*${card.amount} · ${card.statusText}*`,
    '_Ενδεικτικός υπολογισμός_',
  ].join('\n');
}

/** Όνομα αρχείου της εικόνας, π.χ. «fpa-2026-09.png». */
export function vatImageFileName(year: number, month: MonthFilter): string {
  return `fpa-${year}${month === 'all' ? '' : `-${String(month).padStart(2, '0')}`}.png`;
}

/** Σύνδεσμος wa.me με έτοιμο κείμενο, ή null αν το τηλέφωνο δεν είναι έγκυρο. */
export function whatsappLink(phone: string | null | undefined, text: string): string | null {
  const number = toWhatsAppNumber(phone);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

/**
 * Μήνυμα για φίλους: τι κάνει η εφαρμογή και ο σύνδεσμός της. Ο σύνδεσμος μπαίνει στο τέλος, σε δική
 * του γραμμή, ώστε το WhatsApp να δείξει την εικόνα προεπισκόπησης (app/opengraph-image.png).
 */
export function buildShareMessage(appUrl: string): string {
  return (
    'Γεια! Με αυτή την εφαρμογή γράφω τις βάρδιες του ταξί από το Ζ, βλέπω αμέσως την αξιοποίηση των ' +
    'χιλιομέτρων, και στο τέλος του μήνα βλέπω ενδεικτικά τον ΦΠΑ: Χρεωστικός ή Πιστωτικός. Γράψου κι εσύ:\n' +
    appUrl
  );
}

/** Σύνδεσμος WhatsApp χωρίς παραλήπτη: ο χρήστης διαλέγει σε ποιον θα το στείλει. */
export function whatsappShareLink(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
