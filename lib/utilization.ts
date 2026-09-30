/**
 * Αξιοποίηση χιλιομέτρων: μισθωμένα / συνολικά χλμ, με όρια ανάλογα με το καύσιμο του αυτοκινήτου.
 *  - Βενζίνη, πετρέλαιο, αέριο: ικανοποιητική από 65%, πολύ ικανοποιητική από 70%.
 *  - Υβριδικό, ηλεκτρικό (φθηνότερο χιλιόμετρο): ικανοποιητική από 55%, πολύ ικανοποιητική από 60%.
 * Κάτω από το όριο: ο μετρητής κοκκινίζει και προτρέπει για περισσότερα μισθωμένα χιλιόμετρα.
 */

export type Fuel = 'petrol' | 'diesel' | 'lpg' | 'hybrid' | 'electric';

export const FUELS: readonly { id: Fuel; label: string }[] = [
  { id: 'petrol', label: 'Βενζίνη' },
  { id: 'diesel', label: 'Πετρέλαιο' },
  { id: 'lpg', label: 'Αέριο' },
  { id: 'hybrid', label: 'Υβριδικό' },
  { id: 'electric', label: 'Ηλεκτρικό' },
];

export function isFuel(value: unknown): value is Fuel {
  return FUELS.some((fuel) => fuel.id === value);
}

export function fuelLabel(fuel: string | null | undefined): string {
  return FUELS.find((item) => item.id === fuel)?.label ?? 'Δεν έχει δηλωθεί';
}

/** Βενζίνη/πετρέλαιο/αέριο ή υβριδικό/ηλεκτρικό. Χωρίς δηλωμένο καύσιμο: τα αυστηρότερα όρια. */
export type FuelGroup = 'combustion' | 'electrified';

export function fuelGroup(fuel: string | null | undefined): FuelGroup {
  return fuel === 'hybrid' || fuel === 'electric' ? 'electrified' : 'combustion';
}

export const FUEL_GROUP_LABEL: Record<FuelGroup, string> = {
  combustion: 'βενζίνη, πετρέλαιο, αέριο',
  electrified: 'υβριδικό, ηλεκτρικό',
};

export interface UtilizationTargets {
  /** Από εδώ και πάνω: ικανοποιητική. */
  ok: number;
  /** Από εδώ και πάνω: πολύ ικανοποιητική. */
  great: number;
}

export const TARGETS: Record<FuelGroup, UtilizationTargets> = {
  combustion: { ok: 65, great: 70 },
  electrified: { ok: 55, great: 60 },
};

/**
 * Όρια για ένα ή περισσότερα αυτοκίνητα (π.χ. όλος ο στόλος): κάθε αυτοκίνητο μετρά ανάλογα με τα
 * χιλιόμετρά του, σε ακέραιο ποσοστό. Χωρίς χιλιόμετρα: τα όρια της ομάδας, αν είναι όλα ίδια,
 * αλλιώς τα αυστηρότερα.
 */
export function targetsFor(cars: readonly { fuel: string | null | undefined; km: number }[]): UtilizationTargets {
  const km = cars.reduce((sum, car) => sum + Math.max(0, car.km), 0);
  if (km <= 0) {
    const groups = new Set(cars.map((car) => fuelGroup(car.fuel)));
    return TARGETS[groups.size === 1 ? [...groups][0] : 'combustion'];
  }
  const weighted = (key: keyof UtilizationTargets) =>
    Math.round(cars.reduce((sum, car) => sum + Math.max(0, car.km) * TARGETS[fuelGroup(car.fuel)][key], 0) / km);
  return { ok: weighted('ok'), great: weighted('great') };
}

export type UtilizationLevel = 'none' | 'low' | 'ok' | 'great';

/** Κρίνεται ό,τι φαίνεται στην οθόνη (1 δεκαδικό): 64,96% γράφεται «65,0%» και είναι ικανοποιητική. */
export function utilizationLevel(pct: number, totalKm: number, targets: UtilizationTargets): UtilizationLevel {
  if (!(totalKm > 0)) return 'none';
  const shown = Math.round(pct * 10) / 10;
  if (shown >= targets.great) return 'great';
  if (shown >= targets.ok) return 'ok';
  return 'low';
}

const pct = (value: number) => `${String(value).replace('.', ',')}%`;

export const LEVEL_TITLE: Record<UtilizationLevel, string> = {
  none: 'Χωρίς χιλιόμετρα ακόμη',
  low: 'Χαμηλή αξιοποίηση',
  ok: 'Ικανοποιητική αξιοποίηση',
  great: 'Πολύ ικανοποιητική αξιοποίηση',
};

/** Τι σημαίνει το επίπεδο και τι να κάνει ο οδηγός. */
export function levelHint(level: UtilizationLevel, targets: UtilizationTargets): string {
  switch (level) {
    case 'none':
      return 'Γράψτε στη βάρδια τα μισθωμένα και τα ελεύθερα χιλιόμετρα από το Ζ.';
    case 'low':
      return `Στόχος ${pct(targets.ok)} και πάνω: προσπαθήστε για περισσότερα μισθωμένα χιλιόμετρα, με λιγότερα άδεια ανάμεσα στις κούρσες.`;
    case 'ok':
      return `Καλή δουλειά· από ${pct(targets.great)} και πάνω γίνεται πολύ ικανοποιητική.`;
    case 'great':
      return 'Πολύ καλή δουλειά: συνεχίστε έτσι.';
  }
}

/** Η κλίμακα με τα τρία επίπεδα (για σύγκριση): κάτω από το όριο, ανάμεσα, από το ανώτερο και πάνω. */
export function levelScale(targets: UtilizationTargets): { level: Exclude<UtilizationLevel, 'none'>; range: string; label: string }[] {
  return [
    { level: 'low', range: `κάτω από ${pct(targets.ok)}`, label: 'Χαμηλή' },
    { level: 'ok', range: `${pct(targets.ok)} – ${pct(targets.great)}`, label: 'Ικανοποιητική' },
    { level: 'great', range: `${pct(targets.great)} και πάνω`, label: 'Πολύ ικανοποιητική' },
  ];
}
