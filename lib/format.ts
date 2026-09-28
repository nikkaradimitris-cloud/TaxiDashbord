const euro = new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' });
const decimal1 = new Intl.NumberFormat('el-GR', { maximumFractionDigits: 1 });
const decimal2 = new Intl.NumberFormat('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const integer = new Intl.NumberFormat('el-GR', { maximumFractionDigits: 0 });
const dateTime = new Intl.DateTimeFormat('el-GR', {
  timeZone: 'Europe/Athens',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** ISO timestamp → "27/09/2026 15:44" (ώρα Ελλάδας). */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return dateTime.format(date).replace(',', '');
}

/** 123456 λεπτά → "1.234,56 €" */
export function formatEuro(cents: number): string {
  return euro.format(cents / 100);
}

/** Διαφορά με πρόσημο: 620 → "+6,20 €", −10 → "−0,10 €", 0 → "0,00 €" */
export function formatSignedEuro(cents: number): string {
  const sign = cents > 0 ? '+' : cents < 0 ? '−' : '';
  return `${sign}${euro.format(Math.abs(cents) / 100)}`;
}

/** Χιλιόμετρα με έως 1 δεκαδικό: 1234.56 → "1.234,6" */
export function formatKm(km: number): string {
  return decimal1.format(km);
}

/** 72.43 → "72,4%" */
export function formatPercent(pct: number): string {
  return `${decimal1.format(pct)}%`;
}

/** Ευρώ ανά χιλιόμετρο: 0.8 → "0,80 €/χλμ" */
export function formatEuroPerKm(value: number): string {
  return `${decimal2.format(value)} €/χλμ`;
}

export function formatInteger(value: number): string {
  return integer.format(value);
}

/** Αριθμός με έως 1 δεκαδικό: 12.34 → "12,3" */
export function formatDecimal(value: number): string {
  return decimal1.format(value);
}

/** Ποσό για άξονα γραφήματος, χωρίς περιττά δεκαδικά: 100000 λεπτά → "1.000 €", 250 → "2,50 €" */
export function formatEuroTick(cents: number): string {
  return cents % 100 === 0 ? `${integer.format(cents / 100)}\u00a0€` : formatEuro(cents);
}

/** Ποσό για CSV/Excel: 123456 λεπτά → "1234,56" (χωρίς χιλιάδες, ελληνική υποδιαστολή). */
export function formatCentsPlain(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const euros = Math.floor(abs / 100);
  const rest = String(abs % 100).padStart(2, '0');
  return `${sign}${euros},${rest}`;
}

/** Αριθμός για CSV/Excel με ελληνική υποδιαστολή: 12.5 → "12,5" */
export function formatDecimalPlain(value: number, maxDecimals = 2): string {
  const factor = 10 ** maxDecimals;
  const rounded = Math.round(value * factor) / factor;
  return String(rounded).replace('.', ',');
}
