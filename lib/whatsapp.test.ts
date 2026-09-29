import { describe, expect, it } from 'vitest';
import { computeExpense, computeShift, summarize } from './accounting';
import { buildShareMessage, buildVatMessage, toWhatsAppNumber, whatsappLink, whatsappShareLink } from './whatsapp';

describe('toWhatsAppNumber', () => {
  it.each([
    ['6912345678', '306912345678'],
    ['691 234 5678', '306912345678'],
    ['+30 691 234 5678', '306912345678'],
    ['0030 6912345678', '306912345678'],
    ['306912345678', '306912345678'],
    ['+355 69 123 4567', '355691234567'],
  ])('%s → %s', (input, expected) => {
    expect(toWhatsAppNumber(input)).toBe(expected);
  });

  it.each(['', '12345', 'abc', null, undefined])('%s → null', (input) => {
    expect(toWhatsAppNumber(input)).toBeNull();
  });
});

describe('buildVatMessage / whatsappLink', () => {
  const totals = summarize([
    computeShift({
      trips: 10,
      paidKm: 100,
      emptyKm: 50,
      netRevenue: 160.39,
      tips: 5,
      fuel: 50,
      otherExpenses: 0,
      repairs: 0,
    }),
  ]);

  it('περιέχει όνομα, πινακίδα, μήνα, είσπραξη, έξοδα, ΦΠΑ και ένδειξη', () => {
    const text = buildVatMessage({ driverName: 'Γιώργος', plate: 'ΤΑΕ-1234', year: 2026, month: 9, totals });
    expect(text).toContain('Οδηγός: Γιώργος');
    expect(text).toContain('Όχημα: ΤΑΕ-1234');
    expect(text).toContain('Μήνας: Σεπτέμβριος 2026');
    expect(text).toContain('Είσπραξη (μικτή): 186,23');
    expect(text).toContain('Έξοδα: 50,00');
    expect(text).toContain('Προς απόδοση ΦΠΑ: 11,16');
    expect(text).toContain('(Χρεωστικό)');
  });

  it('έξοδα οχήματος: στο σύνολο εξόδων, με ανάλυση καύσιμα + οχήματος', () => {
    const withRepair = summarize(
      [computeShift({ trips: 10, paidKm: 100, emptyKm: 50, netRevenue: 160.39, tips: 5, fuel: 50, otherExpenses: 0, repairs: 0 })],
      [computeExpense(800)],
    );
    const text = buildVatMessage({ driverName: 'Γιώργος', plate: 'ΤΑΕ-1234', year: 2026, month: 9, totals: withRepair });
    expect(text.replace(/\u00a0/g, ' ')).toContain('Έξοδα: 850,00 € (καύσιμα 50,00 € + οχήματος 800,00 €)');
    expect(text).toContain('Προς απόδοση ΦΠΑ: 143,68');
    expect(text).toContain('(Πιστωτικό)');
  });

  it('εφαρμογές: κρατήσεις στα έξοδα και διαδρομές δρόμου / εφαρμογών', () => {
    const withApps = summarize(
      [computeShift({ trips: 10, paidKm: 100, emptyKm: 50, netRevenue: 160.39, tips: 5, fuel: 50, otherExpenses: 0, repairs: 0 })],
      [],
      [{ trips: 4, turnoverCents: 8000, commissionCents: 1200, commissionVatCents: 0 }],
    );
    const text = buildVatMessage({ driverName: 'Γ', plate: 'Χ', year: 2026, month: 9, totals: withApps }).replace(/ /g, ' ');
    expect(text).toContain('Έξοδα: 62,00 € (καύσιμα 50,00 € + κρατήσεις εφαρμογών 12,00 €)');
    expect(text).toContain('Διαδρομές: 10 (δρόμος 6, εφαρμογές 4)');
    // Χωρίς εφαρμογές δεν εμφανίζεται η γραμμή διαδρομών.
    expect(buildVatMessage({ driverName: 'Γ', plate: 'Χ', year: 2026, month: 9, totals })).not.toContain('Διαδρομές');
  });

  it('ολόκληρο έτος → "Περίοδος: Έτος 2026"', () => {
    const text = buildVatMessage({ driverName: 'Γ', plate: null, year: 2026, month: 'all', totals });
    expect(text).toContain('Περίοδος: Έτος 2026');
    expect(text).toContain('Όχημα: -');
  });

  it('πιστωτικό υπόλοιπο', () => {
    const credit = summarize([
      computeShift({ trips: 0, paidKm: 0, emptyKm: 0, netRevenue: 0, tips: 0, fuel: 0, otherExpenses: 0, repairs: 124 }),
    ]);
    const text = buildVatMessage({ driverName: 'Γ', plate: 'Χ', year: 2026, month: 1, totals: credit });
    expect(text).toContain('Προς απόδοση ΦΠΑ: 24,00');
    expect(text).toContain('(Πιστωτικό)');
  });

  it('σωστό wa.me link με κωδικοποιημένο κείμενο', () => {
    const link = whatsappLink('6912345678', 'Γεια σου & καλή βάρδια');
    expect(link).toBe(`https://wa.me/306912345678?text=${encodeURIComponent('Γεια σου & καλή βάρδια')}`);
    expect(whatsappLink('', 'x')).toBeNull();
  });

  it('μήνυμα για φίλους: ο σύνδεσμος στο τέλος, σε δική του γραμμή· WhatsApp χωρίς παραλήπτη', () => {
    const text = buildShareMessage('https://taxi-dashbord.vercel.app');
    expect(text).toContain('αξιοποίηση των χιλιομέτρων');
    expect(text).toContain('ΦΠΑ: Χρεωστικός ή Πιστωτικός');
    expect(text.endsWith('Γράψου κι εσύ:\nhttps://taxi-dashbord.vercel.app')).toBe(true);
    const link = whatsappShareLink(text);
    expect(link).toBe(`https://wa.me/?text=${encodeURIComponent(text)}`);
  });
});
