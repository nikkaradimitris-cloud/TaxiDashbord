/**
 * «Λείπει Ζ»: τα Ζ του ταξιμέτρου κάθε αυτοκινήτου είναι συνεχόμενα (5, 6, 7, …). Ελέγχονται μόνο
 * τα κενά ανάμεσα στο πρώτο και στο τελευταίο Ζ της περιόδου που φαίνεται: όχι πριν από το πρώτο
 * (π.χ. οι καταχωρήσεις ξεκίνησαν στη μέση του μήνα) ούτε μετά το τελευταίο (ο μήνας δεν έκλεισε).
 */
import type { DriverRow, ShiftRow } from './types';

/** Κενό μεγαλύτερο από τόσα Ζ μοιάζει με λάθος αριθμό (π.χ. 1001 αντί για 101), όχι με βάρδιες που λείπουν. */
export const Z_JUMP_LIMIT = 31;

/** Συνεχόμενα Ζ, από–έως (και τα δύο μέσα). */
export interface ZRange {
  from: number;
  to: number;
}

export interface CarZGaps {
  /** Πινακίδα, ή ο οδηγός όταν δεν έχει πινακίδα. */
  key: string;
  /** «ΤΑΕ-1234 · Γιώργος Παπαδόπουλος» */
  label: string;
  /** Ζ που λείπουν. */
  missing: ZRange[];
  missingCount: number;
  /** Πολύ μεγάλα κενά: μάλλον λάθος αριθμός Ζ. */
  jumps: ZRange[];
}

/** «101» → 101· ό,τι δεν είναι σκέτος αριθμός (π.χ. «12Α») δεν μπαίνει στον έλεγχο. */
export function parseZ(value: string): number | null {
  const trimmed = value.trim();
  return /^\d{1,9}$/.test(trimmed) ? Number(trimmed) : null;
}

const plateOf = (driver: DriverRow | undefined) => driver?.plate?.trim().toUpperCase() || null;

/**
 * Κενά στα Ζ ανά αυτοκίνητο (πινακίδα). `onlyDriverId`: οι βάρδιες είναι μόνο ενός οδηγού (φίλτρο)·
 * τότε αυτοκίνητο που το οδηγούν κι άλλοι δεν ελέγχεται, γιατί τα δικά τους Ζ δεν φαίνονται.
 */
export function findZGaps(
  shifts: Pick<ShiftRow, 'driver_id' | 'z_number'>[],
  drivers: DriverRow[],
  onlyDriverId: string | null,
): CarZGaps[] {
  const driversById = new Map(drivers.map((driver) => [driver.id, driver]));
  const groups = new Map<string, { plate: string | null; driverIds: Set<string>; numbers: Set<number> }>();

  for (const shift of shifts) {
    const z = parseZ(shift.z_number);
    if (z === null) continue;
    const plate = plateOf(driversById.get(shift.driver_id));
    const key = plate ?? `driver:${shift.driver_id}`;
    const group = groups.get(key) ?? { plate, driverIds: new Set<string>(), numbers: new Set<number>() };
    group.driverIds.add(shift.driver_id);
    group.numbers.add(z);
    groups.set(key, group);
  }

  const result: CarZGaps[] = [];
  for (const [key, group] of groups) {
    if (onlyDriverId && group.plate) {
      const shared = drivers.some((driver) => driver.id !== onlyDriverId && plateOf(driver) === group.plate);
      if (shared) continue;
    }
    const numbers = [...group.numbers].sort((a, b) => a - b);
    const missing: ZRange[] = [];
    const jumps: ZRange[] = [];
    let missingCount = 0;
    for (let i = 1; i < numbers.length; i++) {
      const gap = numbers[i] - numbers[i - 1] - 1;
      if (gap <= 0) continue;
      const range = { from: numbers[i - 1] + 1, to: numbers[i] - 1 };
      if (gap > Z_JUMP_LIMIT) jumps.push(range);
      else {
        missing.push(range);
        missingCount += gap;
      }
    }
    if (missing.length === 0 && jumps.length === 0) continue;
    const names = [...group.driverIds]
      .map((id) => driversById.get(id)?.name)
      .filter((name): name is string => !!name)
      .sort((a, b) => a.localeCompare(b, 'el'));
    const label = [group.plate, names.join(', ')].filter(Boolean).join(' · ') || 'Χωρίς όνομα';
    result.push({ key, label, missing, missingCount, jumps });
  }
  return result.sort((a, b) => a.label.localeCompare(b.label, 'el'));
}

const rangeText = (range: ZRange) => (range.from === range.to ? `${range.from}` : `${range.from}–${range.to}`);

/** «λείπει το Ζ 7» / «λείπουν τα Ζ 7, 9–11» */
export function missingZText(car: CarZGaps): string {
  const list = car.missing.map(rangeText).join(', ');
  return car.missingCount === 1 ? `λείπει το Ζ ${list}` : `λείπουν τα Ζ ${list}`;
}

/** «από Ζ 101 σε Ζ 1001: μήπως γράφτηκε λάθος ο αριθμός;» */
export function jumpText(range: ZRange): string {
  return `από Ζ ${range.from - 1} σε Ζ ${range.to + 1}: μήπως γράφτηκε λάθος ο αριθμός;`;
}

/** Σήμανση στον τίτλο του ιστορικού: «λείπει 1 Ζ», «λείπουν 3 Ζ» ή «έλεγχος Ζ». */
export function zGapBadge(gaps: CarZGaps[]): string | null {
  const count = gaps.reduce((sum, car) => sum + car.missingCount, 0);
  if (count > 0) return count === 1 ? 'λείπει 1 Ζ' : `λείπουν ${count} Ζ`;
  return gaps.some((car) => car.jumps.length > 0) ? 'έλεγχος Ζ' : null;
}
