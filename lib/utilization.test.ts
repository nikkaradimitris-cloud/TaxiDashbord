import { describe, expect, it } from 'vitest';
import { fuelGroup, fuelLabel, isFuel, levelHint, levelScale, TARGETS, targetsFor, utilizationLevel } from './utilization';

describe('αξιοποίηση χιλιομέτρων', () => {
  it('καύσιμα: βενζίνη/πετρέλαιο/αέριο αυστηρότερα από υβριδικό/ηλεκτρικό', () => {
    expect(['petrol', 'diesel', 'lpg'].map(fuelGroup)).toEqual(['combustion', 'combustion', 'combustion']);
    expect(['hybrid', 'electric'].map(fuelGroup)).toEqual(['electrified', 'electrified']);
    expect(fuelGroup(null)).toBe('combustion'); // δεν δηλώθηκε: τα αυστηρότερα όρια
    expect(TARGETS.combustion).toEqual({ ok: 65, great: 70 });
    expect(TARGETS.electrified).toEqual({ ok: 55, great: 60 });
    expect(fuelLabel('diesel')).toBe('Πετρέλαιο');
    expect(fuelLabel(null)).toBe('Δεν έχει δηλωθεί');
    expect(isFuel('lpg')).toBe(true);
    expect(isFuel('coal')).toBe(false);
  });

  it('επίπεδα: κάτω από το όριο κόκκινο, μετά ικανοποιητική, πολύ ικανοποιητική', () => {
    const petrol = TARGETS.combustion;
    expect(utilizationLevel(64.9, 100, petrol)).toBe('low');
    expect(utilizationLevel(64.96, 100, petrol)).toBe('ok'); // φαίνεται «65,0%»
    expect(utilizationLevel(65, 100, petrol)).toBe('ok');
    expect(utilizationLevel(66.8, 120.5, petrol)).toBe('ok'); // Ζ 1024 του «Καλώς ήρθατε»
    expect(utilizationLevel(70, 100, petrol)).toBe('great');
    const electric = TARGETS.electrified;
    expect(utilizationLevel(54.9, 100, electric)).toBe('low');
    expect(utilizationLevel(56, 100, electric)).toBe('ok');
    expect(utilizationLevel(62, 100, electric)).toBe('great');
    expect(utilizationLevel(0, 0, petrol)).toBe('none');
  });

  it('όλος ο στόλος: όρια ανάλογα με τα χιλιόμετρα κάθε αυτοκινήτου', () => {
    expect(targetsFor([{ fuel: 'diesel', km: 120 }])).toEqual({ ok: 65, great: 70 });
    expect(targetsFor([{ fuel: 'electric', km: 80 }])).toEqual({ ok: 55, great: 60 });
    // 120,5 χλμ βενζίνη + 80 χλμ υβριδικό → (120,5×65 + 80×55) / 200,5 = 61,0
    expect(targetsFor([{ fuel: 'petrol', km: 120.5 }, { fuel: 'hybrid', km: 80 }])).toEqual({ ok: 61, great: 66 });
    // 120,5 χλμ πετρέλαιο + 95 χλμ υβριδικό → 60,6 → 61% (ακέραιο)
    expect(targetsFor([{ fuel: 'diesel', km: 120.5 }, { fuel: 'hybrid', km: 95 }])).toEqual({ ok: 61, great: 66 });
    // Χωρίς χιλιόμετρα: τα όρια της ομάδας ή, αν είναι ανάμεικτα, τα αυστηρότερα.
    expect(targetsFor([{ fuel: 'hybrid', km: 0 }])).toEqual({ ok: 55, great: 60 });
    expect(targetsFor([{ fuel: 'hybrid', km: 0 }, { fuel: 'lpg', km: 0 }])).toEqual({ ok: 65, great: 70 });
    expect(targetsFor([])).toEqual({ ok: 65, great: 70 });
  });

  it('κείμενα: στόχος και κλίμακα με τα όρια του καυσίμου', () => {
    expect(levelHint('low', TARGETS.combustion)).toContain('Στόχος 65% και πάνω');
    expect(levelHint('ok', TARGETS.electrified)).toContain('από 60% και πάνω');
    expect(levelScale({ ok: 61, great: 66.5 }).map((step) => step.range)).toEqual([
      'κάτω από 61%',
      '61% – 66,5%',
      '66,5% και πάνω',
    ]);
  });
});
