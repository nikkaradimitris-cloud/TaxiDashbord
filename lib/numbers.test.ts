import { describe, expect, it } from 'vitest';
import { parseDecimal, parseOptionalDecimal, parseOptionalInteger } from './numbers';

describe('parseDecimal', () => {
  it.each([
    ['12,5', 12.5],
    ['12.5', 12.5],
    ['160,39', 160.39],
    ['1.234,56', 1234.56],
    ['1,234.56', 1234.56],
    ['1.234.567', 1234567],
    [' 7 ', 7],
    ['12 €', 12],
    [',5', 0.5],
    ['12,', 12],
    ['0', 0],
  ])('"%s" → %d', (input, expected) => {
    expect(parseDecimal(input)).toBe(expected);
  });

  it.each(['', '   ', 'abc', '-5', '1,2,3', '12a', '1e3', '--'])('"%s" → null', (input) => {
    expect(parseDecimal(input)).toBeNull();
  });
});

describe('parseOptionalDecimal', () => {
  it('κενό πεδίο = 0', () => {
    expect(parseOptionalDecimal('')).toBe(0);
    expect(parseOptionalDecimal(undefined)).toBe(0);
  });

  it('άκυρη τιμή = null', () => {
    expect(parseOptionalDecimal('x')).toBeNull();
  });
});

describe('parseOptionalInteger', () => {
  it('ακέραιοι μόνο', () => {
    expect(parseOptionalInteger('14')).toBe(14);
    expect(parseOptionalInteger('')).toBe(0);
    expect(parseOptionalInteger('3,5')).toBeNull();
    expect(parseOptionalInteger('-2')).toBeNull();
  });
});
