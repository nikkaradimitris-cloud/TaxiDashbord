import { describe, expect, it } from 'vitest';
import { EMPTY_SHIFT_FORM, parseShiftForm, toShiftInsert } from './shift-form';

describe('parseShiftForm', () => {
  it('ο αριθμός Ζ είναι υποχρεωτικός', () => {
    const { input, errors } = parseShiftForm({ ...EMPTY_SHIFT_FORM, netRevenue: '100' });
    expect(input).toBeNull();
    expect(errors.zNumber).toBeDefined();
  });

  it('δέχεται ελληνικό κόμμα και κενά προαιρετικά πεδία', () => {
    const { input, errors, preview } = parseShiftForm({
      ...EMPTY_SHIFT_FORM,
      zNumber: ' 0123 ',
      trips: '14',
      paidKm: '80,5',
      emptyKm: '40',
      netRevenue: '160,39',
    });
    expect(errors).toEqual({});
    expect(input).toMatchObject({ trips: 14, paidKm: 80.5, netRevenue: 160.39, tips: 0, fuel: 0 });
    expect(preview.vatCents).toBe(2084);
  });

  it('δείχνει σφάλμα σε άκυρες τιμές αλλά κρατά την προεπισκόπηση', () => {
    const { input, errors, preview } = parseShiftForm({
      ...EMPTY_SHIFT_FORM,
      zNumber: '1',
      netRevenue: '100',
      fuel: 'abc',
      trips: '2,5',
    });
    expect(input).toBeNull();
    expect(errors.fuel).toBeDefined();
    expect(errors.trips).toBeDefined();
    expect(preview.netRevenueCents).toBe(10000);
  });

  it('απορρίπτει μη ρεαλιστικά ποσά (προστασία υπερχείλισης)', () => {
    const { errors } = parseShiftForm({ ...EMPTY_SHIFT_FORM, zNumber: '1', netRevenue: '5000000' });
    expect(errors.netRevenue).toBeDefined();
  });
});

describe('toShiftInsert', () => {
  it('στρογγυλοποιεί σε 2 δεκαδικά όπως η βάση', () => {
    const { input } = parseShiftForm({ ...EMPTY_SHIFT_FORM, zNumber: 'Z1', netRevenue: '1,005', paidKm: '10,126' });
    const row = toShiftInsert(input!, { id: 'x', driverId: 'd', year: 2026, month: 9, zNumber: ' Z1 ' });
    expect(row).toMatchObject({ net_revenue: 1.01, paid_km: 10.13, z_number: 'Z1', year: 2026, month: 9 });
    expect(row).not.toHaveProperty('vat');
  });
});
