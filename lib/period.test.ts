import { describe, expect, it } from 'vitest';
import { periodLabel, yearOptions } from './period';

describe('period', () => {
  it('ετικέτες περιόδου', () => {
    expect(periodLabel(2026, 9)).toBe('Σεπτέμβριος 2026');
    expect(periodLabel(2026, 'all')).toBe('Έτος 2026');
  });

  it('έτη από το 2020 έως το επόμενο, με φθίνουσα σειρά', () => {
    const years = yearOptions(2026);
    expect(years[0]).toBe(2027);
    expect(years.at(-1)).toBe(2020);
    expect(yearOptions(2026, [2018])).toContain(2018);
  });
});
