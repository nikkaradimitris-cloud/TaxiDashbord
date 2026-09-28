import { describe, expect, it } from 'vitest';
import {
  categoryLabel,
  EMPTY_EXPENSE_FORM,
  expenseToFormValues,
  parseExpenseForm,
  toExpenseValues,
} from './expenses';

describe('parseExpenseForm', () => {
  it('συνεργείο 800 €: ΦΠΑ 24% μέσα = 154,84 €', () => {
    const { amount, errors, preview } = parseExpenseForm({ ...EMPTY_EXPENSE_FORM, amount: '800' });
    expect(errors).toEqual({});
    expect(amount).toBe(800);
    expect(preview).toEqual({ amountCents: 80000, vatCents: 15484 });
  });

  it('δέχεται ελληνικό κόμμα και χιλιάδες', () => {
    expect(parseExpenseForm({ ...EMPTY_EXPENSE_FORM, amount: '45,50' }).amount).toBe(45.5);
    expect(parseExpenseForm({ ...EMPTY_EXPENSE_FORM, amount: '1.234,56' }).amount).toBe(1234.56);
  });

  it('το ποσό είναι υποχρεωτικό και θετικό', () => {
    expect(parseExpenseForm(EMPTY_EXPENSE_FORM).errors.amount).toBeDefined();
    expect(parseExpenseForm({ ...EMPTY_EXPENSE_FORM, amount: '0' }).errors.amount).toBeDefined();
    expect(parseExpenseForm({ ...EMPTY_EXPENSE_FORM, amount: 'abc' }).errors.amount).toBeDefined();
    expect(parseExpenseForm({ ...EMPTY_EXPENSE_FORM, amount: '5000000' }).errors.amount).toBeDefined();
    expect(parseExpenseForm({ ...EMPTY_EXPENSE_FORM, amount: '0,001' }).errors.amount).toBeDefined();
  });

  it('περιγραφή έως 200 χαρακτήρες', () => {
    const long = parseExpenseForm({ ...EMPTY_EXPENSE_FORM, amount: '10', description: 'α'.repeat(201) });
    expect(long.errors.description).toBeDefined();
    expect(long.amount).toBeNull();
  });
});

describe('toExpenseValues / expenseToFormValues', () => {
  it('στρογγυλοποιεί και καθαρίζει την περιγραφή', () => {
    const values = { category: 'other' as const, amount: '320,555', description: '  4 λάστιχα ' };
    const row = toExpenseValues(values, parseExpenseForm(values).amount!, { driverId: 'd', year: 2026, month: 9 });
    expect(row).toEqual({
      driver_id: 'd',
      year: 2026,
      month: 9,
      category: 'other',
      description: '4 λάστιχα',
      amount: 320.56,
    });
    expect(row).not.toHaveProperty('vat');
  });

  it('η φόρμα διαβάζει ξανά την ίδια εγγραφή', () => {
    const values = expenseToFormValues({ category: 'repairs', amount: 800.5, description: 'Φρένα' });
    expect(values).toEqual({ category: 'repairs', amount: '800,5', description: 'Φρένα' });
    expect(parseExpenseForm(values).amount).toBe(800.5);
    expect(expenseToFormValues({ category: 'κάτι', amount: 1, description: '' }).category).toBe('other');
  });

  it('ετικέτες κατηγοριών', () => {
    expect(categoryLabel('repairs')).toBe('Επισκευές / Συντήρηση');
    expect(categoryLabel('other')).toBe('Άλλα έξοδα');
    expect(categoryLabel('wash')).toBe('Άλλα έξοδα');
  });
});
