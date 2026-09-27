import { describe, expect, it } from 'vitest';
import { normalizeName, planLegacyImport } from './legacy';

const localDrivers = [
  { id: '1', name: 'Ιδιοκτήτης', plate: 'ΤΑΕ-1234', phone: '6900000000' },
  { id: 'a0b1c2d3-e4f5-4a6b-8c7d-9e0f1a2b3c4d', name: 'Γιώργος', plate: '-', phone: '' },
];

const localShifts = [
  {
    id: '5f0c7a3e-2b1d-4c9e-8f6a-1d2e3f4a5b6c',
    driverName: 'Ιδιοκτήτης',
    zNumber: '101',
    trips: 14,
    paidKm: 80.5,
    emptyKm: 40,
    netRevenue: 160.39,
    vat: 20.84,
    tips: 5,
    fuel: 40,
    expenses: 10,
    repairs: 0,
    date: '2026-09',
  },
  {
    id: 'not-a-uuid',
    driverName: 'Νίκος ',
    zNumber: '',
    trips: '3',
    paidKm: '12,5',
    emptyKm: 0,
    netRevenue: 30,
    vat: 3.9,
    tips: 0,
    fuel: 0,
    expenses: 0,
    repairs: 0,
    date: '2025-12',
  },
  { id: 'x', driverName: 'Κακή', netRevenue: -5, date: '2026-01' },
  { id: 'y', driverName: 'Χωρίς μήνα', netRevenue: 5, date: 'χθες' },
];

describe('planLegacyImport', () => {
  const plan = planLegacyImport(localShifts, localDrivers, () => 'generated-id');

  it('μεταφέρει οδηγούς με πινακίδα/τηλέφωνο και προσθέτει όσους υπάρχουν μόνο σε βάρδιες', () => {
    expect(plan.drivers).toEqual([
      { name: 'Ιδιοκτήτης', plate: 'ΤΑΕ-1234', phone: '6900000000' },
      { name: 'Γιώργος', plate: null, phone: null },
      { name: 'Νίκος', plate: null, phone: null },
    ]);
  });

  it('μετατρέπει το "YYYY-MM" σε έτος/μήνα και τα πεδία στη νέα μορφή', () => {
    expect(plan.shifts[0]).toEqual({
      id: '5f0c7a3e-2b1d-4c9e-8f6a-1d2e3f4a5b6c',
      driverName: 'Ιδιοκτήτης',
      year: 2026,
      month: 9,
      z_number: '101',
      trips: 14,
      paid_km: 80.5,
      empty_km: 40,
      net_revenue: 160.39,
      tips: 5,
      fuel: 40,
      other_expenses: 10,
      repairs: 0,
    });
  });

  it('κρατά το αρχικό id (χωρίς διπλοεγγραφές αν ξανατρέξει) ή δίνει νέο', () => {
    expect(plan.shifts[1]).toMatchObject({ id: 'generated-id', year: 2025, month: 12, z_number: '-', paid_km: 12.5, trips: 3 });
  });

  it('παραλείπει άκυρες εγγραφές', () => {
    expect(plan.shifts).toHaveLength(2);
    expect(plan.skipped).toBe(2);
  });

  it('ανέχεται κατεστραμμένα δεδομένα', () => {
    expect(planLegacyImport('σκουπίδια', null, () => 'id')).toEqual({ drivers: [], shifts: [], skipped: 0 });
  });
});

describe('normalizeName', () => {
  it('αγνοεί κεφαλαία/πεζά και κενά', () => {
    expect(normalizeName('  ΓΙΏΡΓΟΣ   Παπαδόπουλος ')).toBe(normalizeName('γιώργος παπαδόπουλος'));
  });
});
