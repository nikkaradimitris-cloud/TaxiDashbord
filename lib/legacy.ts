/**
 * Μεταφορά δεδομένων από την παλιά τοπική (offline) έκδοση, που αποθήκευε
 * τα πάντα στο localStorage του browser (κλειδιά `taxi_shifts`, `taxi_drivers`).
 */

export const LEGACY_SHIFTS_KEY = 'taxi_shifts';
export const LEGACY_DRIVERS_KEY = 'taxi_drivers';
export const LEGACY_BACKUP_SUFFIX = '_backup_imported';

export interface LegacyDriver {
  name: string;
  plate: string | null;
  phone: string | null;
}

export interface LegacyShift {
  id: string;
  driverName: string;
  year: number;
  month: number;
  z_number: string;
  trips: number;
  paid_km: number;
  empty_km: number;
  net_revenue: number;
  tips: number;
  fuel: number;
  other_expenses: number;
  repairs: number;
}

export interface LegacyPlan {
  drivers: LegacyDriver[];
  shifts: LegacyShift[];
  skipped: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('el-GR');
}

function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
}

/** Μη αρνητικός αριθμός με 2 δεκαδικά, ή null αν είναι άκυρος. */
function amount(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value.replace(',', '.')) : Number(value ?? 0);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

export function planLegacyImport(rawShifts: unknown, rawDrivers: unknown, newId: () => string): LegacyPlan {
  const drivers = new Map<string, LegacyDriver>();
  const shifts: LegacyShift[] = [];
  let skipped = 0;

  for (const raw of Array.isArray(rawDrivers) ? rawDrivers : []) {
    const name = text(raw?.name);
    if (!name) continue;
    const key = normalizeName(name);
    if (!drivers.has(key)) {
      drivers.set(key, {
        name,
        plate: text(raw?.plate).replace(/^-$/, '') || null,
        phone: text(raw?.phone) || null,
      });
    }
  }

  for (const raw of Array.isArray(rawShifts) ? rawShifts : []) {
    const period = /^(\d{4})-(\d{1,2})/.exec(text(raw?.date));
    const year = period ? Number(period[1]) : NaN;
    const month = period ? Number(period[2]) : NaN;
    const values = {
      trips: amount(raw?.trips),
      paid_km: amount(raw?.paidKm),
      empty_km: amount(raw?.emptyKm),
      net_revenue: amount(raw?.netRevenue),
      tips: amount(raw?.tips),
      fuel: amount(raw?.fuel),
      other_expenses: amount(raw?.expenses),
      repairs: amount(raw?.repairs),
    };
    if (
      !(year >= 2000 && year <= 2100 && month >= 1 && month <= 12) ||
      Object.values(values).some((v) => v === null)
    ) {
      skipped++;
      continue;
    }

    const driverName = text(raw?.driverName) || 'Άγνωστος οδηγός';
    const key = normalizeName(driverName);
    if (!drivers.has(key)) drivers.set(key, { name: driverName, plate: null, phone: null });

    const id = text(raw?.id);
    shifts.push({
      id: UUID.test(id) ? id.toLowerCase() : newId(),
      driverName,
      year,
      month,
      z_number: text(raw?.zNumber).slice(0, 40) || '-',
      trips: Math.round(values.trips!),
      paid_km: values.paid_km!,
      empty_km: values.empty_km!,
      net_revenue: values.net_revenue!,
      tips: values.tips!,
      fuel: values.fuel!,
      other_expenses: values.other_expenses!,
      repairs: values.repairs!,
    });
  }

  return { drivers: [...drivers.values()], shifts, skipped };
}
