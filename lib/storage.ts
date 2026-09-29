/**
 * Μνήμη της συσκευής (localStorage), ως "stores" για το useSyncExternalStore:
 *  - η επιλεγμένη περίοδος (Έτος/Μήνας), το φίλτρο οδηγού και η προβολή πίνακα/γραφήματος,
 *  - το μέγεθος των γραμμάτων (κουμπί «Α+»),
 *  - αν έχει φανεί η οθόνη «Καλώς ήρθατε» και το «Όχι τώρα» στην εγκατάσταση,
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

export type StatsView = 'table' | 'chart';
export type TableGroup = 'shifts' | 'months';

export interface Preferences {
  year: number;
  month: MonthFilter;
  /** 'all' ή id οδηγού. */
  driverFilter: string;
  /** Πίνακας ή γράφημα στην κάρτα «Αναλυτικά». */
  statsView: StatsView;
  /** Γραμμές του πίνακα: μία ανά βάρδια ή μία ανά μήνα του έτους. */
  tableGroup: TableGroup;
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
      statsView: stored.statsView === 'chart' ? 'chart' : 'table',
      tableGroup: stored.tableGroup === 'months' ? 'months' : 'shifts',
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
    statsView: next.statsView,
    tableGroup: next.tableGroup,
    chartMetric: next.chartMetric,
  });
  notify();
}

// ---------------------------------------------------------------------
// Πάνελ ανοιχτά / κλειστά (ανά χρήστη και συσκευή)
// ---------------------------------------------------------------------

/** Τα πάνελ που άνοιξε ή έκλεισε ο χρήστης· όσα λείπουν έχουν την προεπιλογή τους. */
export type PanelStates = Readonly<Record<string, boolean>>;

const panelsKey = (userId: string) => `taxi-tracker:panels:v1:${userId}`;
const NO_PANELS: PanelStates = {};

export function getPanelStates(userId: string): PanelStates {
  return cached(panelsKey(userId), () => {
    const stored = read(panelsKey(userId));
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return NO_PANELS;
    return Object.fromEntries(Object.entries(stored).filter(([, open]) => typeof open === 'boolean'));
  });
}

export function emptyPanelStates(): PanelStates {
  return NO_PANELS;
}

export function setPanelOpen(userId: string, id: string, open: boolean) {
  const current = getPanelStates(userId);
  if (current[id] === open) return;
  const next = { ...current, [id]: open };
  snapshots.set(panelsKey(userId), next);
  write(panelsKey(userId), next);
  notify();
}

// ---------------------------------------------------------------------
// Μέγεθος γραμμάτων (ίδιο για όλους τους χρήστες της συσκευής)
// ---------------------------------------------------------------------

export type TextSize = 'normal' | 'large';

/** Το ίδιο κλειδί διαβάζει και το script του app/layout.tsx πριν εμφανιστεί η σελίδα. */
export const TEXT_SIZE_KEY = 'taxi-tracker:text-size';

export function getTextSize(): TextSize {
  return cached(TEXT_SIZE_KEY, () => (read(TEXT_SIZE_KEY) === 'large' ? 'large' : 'normal'));
}

export function setTextSize(size: TextSize) {
  snapshots.set(TEXT_SIZE_KEY, size);
  write(TEXT_SIZE_KEY, size === 'large' ? size : null);
  applyTextSize(size);
  notify();
}

/** Εφαρμογή στο <html>: το globals.css μεγαλώνει όλα τα γράμματα με `data-text-size="large"`. */
export function applyTextSize(size: TextSize) {
  if (size === 'large') document.documentElement.dataset.textSize = 'large';
  else delete document.documentElement.dataset.textSize;
}

// ---------------------------------------------------------------------
// Καλωσόρισμα, κίνηση ανοίγματος, εγκατάσταση στο κινητό
// ---------------------------------------------------------------------

/** Η οθόνη «Καλώς ήρθατε» έχει φανεί σε αυτή τη συσκευή: βγαίνει μόνη της μόνο την πρώτη φορά. */
export const WELCOME_KEY = 'taxi-tracker:welcome:v1';
/** Η κίνηση του ανοίγματος έχει παιχτεί σε αυτό το άνοιγμα (sessionStorage, το διαβάζει το app/layout.tsx). */
export const SPLASH_KEY = 'taxi-tracker:splash';
/** Πόσες φορές έχει ανοίξει μετά το «Καλώς ήρθατε»: διαλέγει το μήνυμα και τη διαδρομή του ανοίγματος. */
export const SPLASH_TIP_KEY = 'taxi-tracker:splash-tip';
/** «Όχι τώρα» στην πρόταση «Βάλτε την εφαρμογή στην αρχική οθόνη». */
export const INSTALL_DISMISSED_KEY = 'taxi-tracker:install-dismissed';

/** Χωρίς μνήμη συσκευής (π.χ. μπλοκαρισμένη) μετράει ως «έχει φανεί», για να μη βγαίνει κάθε φορά. */
export function hasSeenWelcome(): boolean {
  try {
    return window.localStorage.getItem(WELCOME_KEY) !== null;
  } catch {
    return true;
  }
}

export function setWelcomeSeen() {
  write(WELCOME_KEY, true);
}

export function getInstallDismissed(): boolean {
  return cached(INSTALL_DISMISSED_KEY, () => read(INSTALL_DISMISSED_KEY) === true);
}

export function dismissInstall() {
  snapshots.set(INSTALL_DISMISSED_KEY, true);
  write(INSTALL_DISMISSED_KEY, true);
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
