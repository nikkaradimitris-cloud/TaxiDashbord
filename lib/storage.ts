/**
 * Μνήμη της συσκευής (localStorage), ως "stores" για το useSyncExternalStore:
 *  - η επιλεγμένη περίοδος (Έτος/Μήνας), το φίλτρο οδηγού και τι δείχνει το γράφημα,
 *  - οι βάρδιες που περιμένουν αποστολή όταν δεν υπάρχει σήμα,
 *  - δεδομένα της παλιάς τοπικής έκδοσης (για μεταφορά στο Supabase).
 * Όλες οι προσβάσεις είναι προστατευμένες: σε ιδιωτική περιήγηση απλώς δεν
 * θυμάται τίποτα.
 */
import { isChartMetric, type ChartMetric } from './chart';
import { LEGACY_SHIFTS_KEY } from './legacy';
import { isValidMonth, isValidYear, type MonthFilter } from './period';
import type { ShiftInsert } from './types';

function read(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // χωρίς αποθήκευση — όχι κρίσιμο
  }
}

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

/** Κοινή συνδρομή για όλα τα stores (και αλλαγές από άλλη καρτέλα). */
export function subscribeStorage(listener: () => void) {
  listeners.add(listener);
  const onStorage = () => {
    snapshots.clear();
    listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** Σταθερά αντικείμενα ανά κλειδί, όπως απαιτεί το useSyncExternalStore. */
const snapshots = new Map<string, unknown>();

function cached<T>(key: string, compute: () => T): T {
  if (!snapshots.has(key)) snapshots.set(key, compute());
  return snapshots.get(key) as T;
}

// ---------------------------------------------------------------------
// Περίοδος (Έτος/Μήνας) και φίλτρο οδηγού
// ---------------------------------------------------------------------

export interface Preferences {
  year: number;
  month: MonthFilter;
  /** 'all' ή id οδηγού. */
  driverFilter: string;
  /** Τι δείχνει το γράφημα (Τζίρος / Διαδρομές / Μέση αξία διαδρομής). */
  chartMetric: ChartMetric;
  /** Ο τρέχων μήνας τη στιγμή που άνοιξε η σελίδα (για προειδοποιήσεις). */
  today: { year: number; month: number };
}

const prefsKey = (userId: string) => `taxi-tracker:prefs:v1:${userId}`;

export function getPreferences(userId: string): Preferences {
  return cached(prefsKey(userId), () => {
    const now = new Date();
    const today = { year: now.getFullYear(), month: now.getMonth() + 1 };
    const stored = (read(prefsKey(userId)) ?? {}) as Partial<Preferences>;
    return {
      year: isValidYear(stored.year) ? stored.year : today.year,
      month: stored.month === 'all' || isValidMonth(stored.month) ? stored.month : today.month,
      driverFilter: typeof stored.driverFilter === 'string' ? stored.driverFilter : 'all',
      chartMetric: isChartMetric(stored.chartMetric) ? stored.chartMetric : 'gross',
      today,
    };
  });
}

export function updatePreferences(userId: string, changes: Partial<Omit<Preferences, 'today'>>) {
  const next = { ...getPreferences(userId), ...changes };
  snapshots.set(prefsKey(userId), next);
  write(prefsKey(userId), {
    year: next.year,
    month: next.month,
    driverFilter: next.driverFilter,
    chartMetric: next.chartMetric,
  });
  notify();
}

// ---------------------------------------------------------------------
// Ουρά αποστολής (βάρδιες που καταχωρήθηκαν χωρίς σύνδεση)
// ---------------------------------------------------------------------

export interface PendingShift {
  payload: ShiftInsert & { id: string };
  driverName: string;
  savedAt: string;
  lastError?: string;
}

const outboxKey = (userId: string) => `taxi-tracker:outbox:v1:${userId}`;
const NO_PENDING: PendingShift[] = [];

export function getOutbox(userId: string): PendingShift[] {
  return cached(outboxKey(userId), () => {
    const stored = read(outboxKey(userId));
    return Array.isArray(stored)
      ? (stored as PendingShift[]).filter((item) => item?.payload?.id && item.payload.driver_id)
      : NO_PENDING;
  });
}

export function setOutbox(userId: string, items: PendingShift[]) {
  snapshots.set(outboxKey(userId), items);
  write(outboxKey(userId), items.length ? items : null);
  notify();
}

export function emptyOutbox(): PendingShift[] {
  return NO_PENDING;
}

// ---------------------------------------------------------------------
// Παλιά τοπική έκδοση
// ---------------------------------------------------------------------

/** Πόσες βάρδιες της παλιάς έκδοσης υπάρχουν σε αυτή τη συσκευή. */
export function getLegacyShiftCount(): number {
  return cached(LEGACY_SHIFTS_KEY, () => {
    const stored = read(LEGACY_SHIFTS_KEY);
    return Array.isArray(stored) ? stored.length : 0;
  });
}

export function readLegacyRaw(key: string): unknown {
  return read(key);
}

/** Κρατά αντίγραφο ασφαλείας με άλλο όνομα και "κρύβει" τα παλιά δεδομένα. */
export function archiveLegacyKey(key: string, backupKey: string) {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw !== null) {
      window.localStorage.setItem(backupKey, raw);
      window.localStorage.removeItem(key);
    }
  } catch {
    // αγνοείται
  }
  snapshots.delete(key);
  notify();
}
