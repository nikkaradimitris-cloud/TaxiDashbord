import { describe, expect, it } from 'vitest';
import {
  EMPTY_FIXED_COSTS_FORM,
  fixedCostsSummary,
  fixedCostsToFormValues,
  fixedCostsTotalCents,
  hasFixedCosts,
  parseFixedCosts,
} from './fixed-costs';

describe('parseFixedCosts', () => {
  it('κενά πεδία = δεν δηλώθηκε ποσό', () => {
    const { values, errors } = parseFixedCosts(EMPTY_FIXED_COSTS_FORM);
    expect(errors).toEqual({});
    expect(values).toEqual({ license_cost: null, efka_cost: null });
  });

  it('δέχεται ελληνικό κόμμα και τελεία', () => {
    const { values, errors } = parseFixedCosts({ license: '150', efka: '210,50' });
    expect(errors).toEqual({});
    expect(values).toEqual({ license_cost: 150, efka_cost: 210.5 });
    expect(parseFixedCosts({ license: '1.250,75', efka: '210.5' }).values).toEqual({
      license_cost: 1250.75,
      efka_cost: 210.5,
    });
  });

  it('το μηδέν είναι δηλωμένο ποσό, όχι κενό', () => {
    expect(parseFixedCosts({ license: '0', efka: '' }).values).toEqual({ license_cost: 0, efka_cost: null });
  });

  it('μη έγκυρος αριθμός ή μη ρεαλιστικό ποσό δεν αποθηκεύεται', () => {
    const bad = parseFixedCosts({ license: 'εκατό', efka: '200000' });
    expect(bad.values).toBeNull();
    expect(bad.errors.license).toBeDefined();
    expect(bad.errors.efka).toBeDefined();
  });
});

describe('fixedCostsToFormValues', () => {
  it('γυρίζει τα αποθηκευμένα ποσά με ελληνική υποδιαστολή', () => {
    expect(fixedCostsToFormValues({ license_cost: 150, efka_cost: 210.5 })).toEqual({
      license: '150',
      efka: '210,5',
    });
  });

  it('κενό όπου δεν έχει δηλωθεί', () => {
    expect(fixedCostsToFormValues({ license_cost: null, efka_cost: null })).toEqual(EMPTY_FIXED_COSTS_FORM);
  });
});

describe('hasFixedCosts και fixedCostsTotalCents', () => {
  it('χωρίς κανένα ποσό δεν υπάρχει σύνολο', () => {
    const empty = { license_cost: null, efka_cost: null };
    expect(hasFixedCosts(empty)).toBe(false);
    expect(fixedCostsTotalCents(empty)).toBeNull();
  });

  it('αθροίζει τα δύο πάγια ενός αυτοκινήτου σε λεπτά', () => {
    expect(fixedCostsTotalCents({ license_cost: 150, efka_cost: 210.5 })).toBe(36050);
    // Ένα μόνο δηλωμένο ποσό μετράει κανονικά.
    expect(fixedCostsTotalCents({ license_cost: null, efka_cost: 210.5 })).toBe(21050);
  });
});

describe('fixedCostsSummary', () => {
  it('μετράει σε πόσα αυτοκίνητα έχουν μπει', () => {
    expect(fixedCostsSummary(0, 0)).toBe('Κανένα αυτοκίνητο ακόμη');
    expect(fixedCostsSummary(0, 3)).toBe('Δεν έχουν μπει ακόμη');
    expect(fixedCostsSummary(1, 1)).toBe('Μπήκαν');
    expect(fixedCostsSummary(3, 3)).toBe('Μπήκαν σε όλα τα 3 αυτοκίνητα');
    expect(fixedCostsSummary(2, 3)).toBe('Μπήκαν σε 2 από 3 αυτοκίνητα');
  });
});
