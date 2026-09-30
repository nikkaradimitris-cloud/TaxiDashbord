import { describe, expect, it } from 'vitest';
import { computeExpense, computeShift, summarize } from './accounting';
import {
  buildShareMessage,
  buildVatMessage,
  toWhatsAppNumber,
  vatCardData,
  vatImageFileName,
  whatsappLink,
  whatsappShareLink,
} from './whatsapp';

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

  it('απλό μήνυμα: μόνο ο ΦΠΑ (περίοδος, αυτοκίνητο, ποσό, κατάσταση) και «ενδεικτικός»', () => {
    const text = buildVatMessage({ driverName: 'Γιώργος', plate: 'ΤΑΕ-1234', year: 2026, month: 9, totals }).replace(/\u00a0/g, ' ');
    expect(text).toBe(
      [
        '*Προς απόδοση ΦΠΑ · Σεπτέμβριος 2026*',
        'ΤΑΕ-1234 · Γιώργος',
        '*11,16 € · Χρεωστικό — προς πληρωμή*',
        '_Ενδεικτικός υπολογισμός_',
      ].join('\n'),
    );
    for (const other of ['Είσπραξη', 'Έξοδα', 'ταμείο', 'Βάρδιες', 'Διαδρομές']) expect(text).not.toContain(other);
  });

  it('κάρτα ΦΠΑ (εικόνα): ΦΠΑ εσόδων και εξόδων, ποσό, κατάσταση, ένδειξη', () => {
    const withRepair = summarize(
      [computeShift({ trips: 10, paidKm: 100, emptyKm: 50, netRevenue: 160.39, tips: 5, fuel: 50, otherExpenses: 0, repairs: 0 })],
      [computeExpense(800)],
    );
    const card = vatCardData({ driverName: 'Γιώργος', plate: null, year: 2026, month: 'all', totals: withRepair });
    const plain = (value: string) => value.replace(/\u00a0/g, ' ');
    expect(card.period).toBe('Έτος 2026');
    expect(card.car).toBe('Γιώργος');
    expect(plain(card.vatIn)).toBe('+ 20,84 €');
    expect(plain(card.vatOut)).toBe('− 164,52 €');
    expect(plain(card.amount)).toBe('143,68 €');
    expect(card.status).toBe('credit');
    expect(card.statusText).toBe('Πιστωτικό υπόλοιπο');
    expect(card.note).toContain('δεν αντικαθιστά τον λογιστή');
    expect(vatImageFileName(2026, 9)).toBe('fpa-2026-09.png');
    expect(vatImageFileName(2026, 'all')).toBe('fpa-2026.png');
  });

  it('μηδενικό υπόλοιπο', () => {
    const zero = summarize([]);
    expect(buildVatMessage({ driverName: 'Γ', plate: 'Χ', year: 2026, month: 1, totals: zero }).replace(/\u00a0/g, ' ')).toContain(
      '*0,00 € · Μηδενικό υπόλοιπο*',
    );
  });

  it('σωστό wa.me link με κωδικοποιημένο κείμενο', () => {
    const link = whatsappLink('6912345678', 'Γεια σου & καλή βάρδια');
    expect(link).toBe(`https://wa.me/306912345678?text=${encodeURIComponent('Γεια σου & καλή βάρδια')}`);
    expect(whatsappLink('', 'x')).toBeNull();
  });

  it('μήνυμα για φίλους: ο σύνδεσμος στο τέλος, σε δική του γραμμή· WhatsApp χωρίς παραλήπτη', () => {
    const text = buildShareMessage('https://taxi-dashbord.vercel.app/register');
    expect(text).toContain('αξιοποίηση των χιλιομέτρων');
    expect(text).toContain('ΦΠΑ: Χρεωστικός ή Πιστωτικός');
    expect(text.endsWith('Γράψου κι εσύ:\nhttps://taxi-dashbord.vercel.app/register')).toBe(true);
    const link = whatsappShareLink(text);
    expect(link).toBe(`https://wa.me/?text=${encodeURIComponent(text)}`);
  });
});
