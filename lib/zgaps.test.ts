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
const kostas = driver('k', 'Κώστας Νυχτερινός', 'ΤΑΕ-1234');
const maria = driver('m', 'Μαρία Κωνσταντίνου', 'ΙΚΒ-5678');
const noPlate = driver('n', 'Χωρίς πινακίδα', null);
const drivers = [giorgos, kostas, maria, noPlate];

const shifts = (driverId: string, ...zs: string[]) => zs.map((z) => ({ driver_id: driverId, z_number: z }));

describe('«Λείπει Ζ»', () => {
  it('5, 6, 8 → λείπει το Ζ 7', () => {
    const gaps = findZGaps(shifts('m', '5', '6', '8'), drivers);
    expect(gaps).toEqual([
      { driverId: 'm', label: 'Μαρία Κωνσταντίνου · ΙΚΒ-5678', missing: [{ from: 7, to: 7 }], missingCount: 1, jumps: [] },
    ]);
    expect(missingZText(gaps[0])).toBe('λείπει το Ζ 7');
    expect(zGapBadge(gaps)).toBe('λείπει 1 Ζ');
  });

  it('όχι πριν από το πρώτο Ζ ούτε μετά το τελευταίο (ο μήνας δεν έκλεισε)', () => {
    expect(findZGaps(shifts('m', '50', '51', '52'), drivers)).toEqual([]);
    expect(zGapBadge([])).toBeNull();
  });

  it('πολλά κενά σε σύντομη μορφή', () => {
    const gaps = findZGaps(shifts('m', '1', '3', '7', '8'), drivers);
    expect(gaps[0].missing).toEqual([
      { from: 2, to: 2 },
      { from: 4, to: 6 },
    ]);
    expect(gaps[0].missingCount).toBe(4);
    expect(missingZText(gaps[0])).toBe('λείπουν τα Ζ 2, 4–6');
    expect(zGapBadge(gaps)).toBe('λείπουν 4 Ζ');
  });

  it('ίδιο Ζ δύο φορές, κενά και μηδενικά μπροστά: μετράει ο αριθμός', () => {
    expect(findZGaps(shifts('m', '5', '5', ' 006 ', '7'), drivers)).toEqual([]);
  });

  it('Ζ που δεν είναι σκέτος αριθμός δεν μπαίνει στον έλεγχο', () => {
    expect(parseZ('12Α')).toBeNull();
    expect(parseZ('')).toBeNull();
    expect(parseZ(' 101 ')).toBe(101);
    expect(findZGaps(shifts('m', '10', '12Α', '11'), drivers)).toEqual([]);
  });

  it('κάθε οδηγός χωριστά, και στο ίδιο αυτοκίνητο: άλλα φορολογικά στοιχεία, άλλη σειρά Ζ', () => {
    // Ο Κώστας έχει το Ζ 11 στο ίδιο αυτοκίνητο: δεν καλύπτει το Ζ 11 του Γιώργου.
    const gaps = findZGaps([...shifts('g', '10', '12'), ...shifts('k', '11', '12')], drivers);
    expect(gaps.map((d) => [d.label, missingZText(d)])).toEqual([['Γιώργος Παπαδόπουλος · ΤΑΕ-1234', 'λείπει το Ζ 11']]);
  });

  it('οδηγός χωρίς πινακίδα με το όνομά του· αλφαβητικά', () => {
    const gaps = findZGaps([...shifts('n', '1', '3'), ...shifts('g', '100', '102'), ...shifts('m', '101')], drivers);
    expect(gaps.map((d) => [d.label, missingZText(d)])).toEqual([
      ['Γιώργος Παπαδόπουλος · ΤΑΕ-1234', 'λείπει το Ζ 101'],
      ['Χωρίς πινακίδα', 'λείπει το Ζ 2'],
    ]);
  });

  it('πολύ μεγάλο κενό: μάλλον λάθος αριθμός, όχι βάρδιες που λείπουν', () => {
    const gaps = findZGaps(shifts('m', '101', '1001'), drivers);
    expect(gaps[0].missing).toEqual([]);
    expect(gaps[0].jumps).toEqual([{ from: 102, to: 1000 }]);
    expect(jumpText(gaps[0].jumps[0])).toBe('από Ζ 101 σε Ζ 1001: μήπως γράφτηκε λάθος ο αριθμός;');
    expect(zGapBadge(gaps)).toBe('έλεγχος Ζ');
    // 31 Ζ που λείπουν μετράνε ακόμη ως βάρδιες (π.χ. ένας μήνας χωρίς καταχωρήσεις).
    expect(findZGaps(shifts('m', '1', '33'), drivers)[0].missingCount).toBe(31);
  });
});
