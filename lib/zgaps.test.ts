import { describe, expect, it } from 'vitest';
import type { DriverRow } from './types';
import { findZGaps, jumpText, missingZText, parseZ, zGapBadge } from './zgaps';

const driver = (id: string, name: string, plate: string | null): DriverRow => ({
  id,
  name,
  plate,
  active: true,
  created_at: '2026-09-01T00:00:00Z',
  email: null,
  phone: null,
  user_id: null,
});

const giorgos = driver('g', 'Γιώργος Παπαδόπουλος', 'ΤΑΕ-1234');
const kostas = driver('k', 'Κώστας Νυχτερινός', 'ταε-1234 ');
const maria = driver('m', 'Μαρία Κωνσταντίνου', 'ΙΚΒ-5678');
const noPlate = driver('n', 'Χωρίς πινακίδα', null);
const drivers = [giorgos, kostas, maria, noPlate];

const shifts = (driverId: string, ...zs: string[]) => zs.map((z) => ({ driver_id: driverId, z_number: z }));

describe('«Λείπει Ζ»', () => {
  it('5, 6, 8 → λείπει το Ζ 7', () => {
    const gaps = findZGaps(shifts('m', '5', '6', '8'), drivers, null);
    expect(gaps).toEqual([
      { key: 'ΙΚΒ-5678', label: 'ΙΚΒ-5678 · Μαρία Κωνσταντίνου', missing: [{ from: 7, to: 7 }], missingCount: 1, jumps: [] },
    ]);
    expect(missingZText(gaps[0])).toBe('λείπει το Ζ 7');
    expect(zGapBadge(gaps)).toBe('λείπει 1 Ζ');
  });

  it('όχι πριν από το πρώτο Ζ ούτε μετά το τελευταίο (ο μήνας δεν έκλεισε)', () => {
    expect(findZGaps(shifts('m', '50', '51', '52'), drivers, null)).toEqual([]);
    expect(zGapBadge([])).toBeNull();
  });

  it('πολλά κενά σε σύντομη μορφή', () => {
    const gaps = findZGaps(shifts('m', '1', '3', '7', '8'), drivers, null);
    expect(gaps[0].missing).toEqual([
      { from: 2, to: 2 },
      { from: 4, to: 6 },
    ]);
    expect(gaps[0].missingCount).toBe(4);
    expect(missingZText(gaps[0])).toBe('λείπουν τα Ζ 2, 4–6');
    expect(zGapBadge(gaps)).toBe('λείπουν 4 Ζ');
  });

  it('ίδιο Ζ δύο φορές, κενά και μηδενικά μπροστά: μετράει ο αριθμός', () => {
    expect(findZGaps(shifts('m', '5', '5', ' 006 ', '7'), drivers, null)).toEqual([]);
  });

  it('Ζ που δεν είναι σκέτος αριθμός δεν μπαίνει στον έλεγχο', () => {
    expect(parseZ('12Α')).toBeNull();
    expect(parseZ('')).toBeNull();
    expect(parseZ(' 101 ')).toBe(101);
    expect(findZGaps(shifts('m', '10', '12Α', '11'), drivers, null)).toEqual([]);
  });

  it('ένα ταξίμετρο ανά πινακίδα: δύο οδηγοί στο ίδιο αυτοκίνητο συμπληρώνουν ο ένας τον άλλον', () => {
    const both = [...shifts('g', '10', '12'), ...shifts('k', '11')];
    expect(findZGaps(both, drivers, null)).toEqual([]);
    // Με φίλτρο σε έναν από τους δύο τα Ζ του άλλου δεν φαίνονται: το αυτοκίνητο δεν ελέγχεται.
    expect(findZGaps(shifts('g', '10', '12'), drivers, 'g')).toEqual([]);
  });

  it('με φίλτρο σε οδηγό που είναι μόνος στο αυτοκίνητο ο έλεγχος γίνεται κανονικά', () => {
    expect(findZGaps(shifts('m', '1', '3'), drivers, 'm')[0].missing).toEqual([{ from: 2, to: 2 }]);
  });

  it('κάθε αυτοκίνητο χωριστά· οδηγός χωρίς πινακίδα με το όνομά του', () => {
    const gaps = findZGaps([...shifts('g', '100', '102'), ...shifts('m', '101'), ...shifts('n', '1', '3')], drivers, null);
    // Αλφαβητικά: Τ πριν από Χ.
    expect(gaps.map((car) => [car.label, missingZText(car)])).toEqual([
      ['ΤΑΕ-1234 · Γιώργος Παπαδόπουλος', 'λείπει το Ζ 101'],
      ['Χωρίς πινακίδα', 'λείπει το Ζ 2'],
    ]);
  });

  it('πολύ μεγάλο κενό: μάλλον λάθος αριθμός, όχι βάρδιες που λείπουν', () => {
    const gaps = findZGaps(shifts('m', '101', '1001'), drivers, null);
    expect(gaps[0].missing).toEqual([]);
    expect(gaps[0].jumps).toEqual([{ from: 102, to: 1000 }]);
    expect(jumpText(gaps[0].jumps[0])).toBe('από Ζ 101 σε Ζ 1001: μήπως γράφτηκε λάθος ο αριθμός;');
    expect(zGapBadge(gaps)).toBe('έλεγχος Ζ');
    // 31 Ζ που λείπουν μετράνε ακόμη ως βάρδιες (π.χ. ένας μήνας χωρίς καταχωρήσεις).
    expect(findZGaps(shifts('m', '1', '33'), drivers, null)[0].missingCount).toBe(31);
  });
});
