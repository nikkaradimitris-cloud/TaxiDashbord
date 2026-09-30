/**
 * Πρόσβαση στα δεδομένα από τον browser. Κάθε ερώτημα τρέχει με τα
 * δικαιώματα του συνδεδεμένου χρήστη· το Row Level Security της βάσης
 * αποφασίζει τι βλέπει ο καθένας (ιδιοκτήτης: όλο τον στόλο του, οδηγός: μόνο τα δικά του).
 */
import type { BackupTable } from './backup';
import type { MonthFilter } from './period';
import type { BrowserSupabase } from './supabase/client';
import type { TablesUpdate } from './database.types';
import type { MonthSummaryRow } from './table';
import type { Fuel } from './utilization';
import type {
  DriverRow,
  ExpenseInsert,
  ExpenseRow,
  PlatformRateInsert,
  PlatformRateRow,
  ShiftInsert,
  ShiftRow,
  StatementInsert,
  StatementRow,
} from './types';

const PAGE_SIZE = 1000;

export interface ShiftQuery {
  year: number;
  month: MonthFilter;
  driverId?: string | null;
}

/** Όλες οι βάρδιες της περιόδου, σε σελίδες (το API επιστρέφει έως ~1000 γραμμές ανά αίτημα). */
export async function fetchShifts(supabase: BrowserSupabase, query: ShiftQuery): Promise<ShiftRow[]> {
  const rows: ShiftRow[] = [];
  let total = Infinity;

  while (rows.length < total) {
    let request = supabase.from('shifts').select('*', { count: 'exact' }).eq('year', query.year);
    if (query.month !== 'all') request = request.eq('month', query.month);
    if (query.driverId) request = request.eq('driver_id', query.driverId);

    const { data, error, count } = await request
      .order('month', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(rows.length, rows.length + PAGE_SIZE - 1);
    if (error) throw error;

    total = count ?? rows.length + data.length;
    rows.push(...data);
    if (data.length === 0) break;
  }
  return rows;
}

/**
 * Σύνολα ανά οδηγό και μήνα για όλο το έτος (προβολή `monthly_summary` της βάσης),
 * για τον πίνακα «Ανά μήνα» όταν στη σελίδα είναι ανοιχτός ένας μόνο μήνας.
 */
export async function fetchMonthlySummary(
  supabase: BrowserSupabase,
  query: { year: number; driverId?: string | null },
): Promise<MonthSummaryRow[]> {
  let request = supabase
    .from('monthly_summary')
    .select('month, shifts, trips, net_revenue, vat, gross_receipts')
    .eq('year', query.year);
  if (query.driverId) request = request.eq('driver_id', query.driverId);
  const { data, error } = await request.order('month');
  if (error) throw error;
  return data;
}

/**
 * Καταχώρηση βάρδιας. Το id δημιουργείται στη συσκευή, οπότε μια επανάληψη
 * (π.χ. μετά από διακοπή δικτύου) δεν δημιουργεί ποτέ διπλή εγγραφή.
 * Επιστρέφει null αν η βάρδια υπήρχε ήδη.
 */
export async function insertShift(supabase: BrowserSupabase, payload: ShiftInsert): Promise<ShiftRow | null> {
  const { data, error } = await supabase
    .from('shifts')
    .upsert(payload, { onConflict: 'id', ignoreDuplicates: true })
    .select('*');
  if (error) throw error;
  return data[0] ?? null;
}

/** Υπάρχει ήδη (άλλη) βάρδια με τον ίδιο αριθμό Ζ για τον οδηγό; */
export async function findShiftByZ(
  supabase: BrowserSupabase,
  driverId: string,
  zNumber: string,
  excludeId?: string,
): Promise<ShiftRow | null> {
  let request = supabase.from('shifts').select('*').eq('driver_id', driverId).eq('z_number', zNumber.trim());
  if (excludeId) request = request.neq('id', excludeId);
  const { data, error } = await request.limit(1);
  if (error) throw error;
  return data[0] ?? null;
}

/**
 * Διόρθωση βάρδιας. Επιστρέφει null αν δεν επιτρέπεται
 * (οδηγός: μόνο δικές του καταχωρήσεις μέσα σε 24 ώρες).
 */
export async function updateShift(
  supabase: BrowserSupabase,
  id: string,
  changes: TablesUpdate<'shifts'>,
): Promise<ShiftRow | null> {
  const { data, error } = await supabase.from('shifts').update(changes).eq('id', id).select('*');
  if (error) throw error;
  return data[0] ?? null;
}

/** true αν διαγράφηκε· false αν δεν επιτρέπεται (π.χ. οδηγός μετά από 24 ώρες). */
export async function deleteShift(supabase: BrowserSupabase, id: string): Promise<boolean> {
  const { data, error } = await supabase.from('shifts').delete().eq('id', id).select('id');
  if (error) throw error;
  return data.length > 0;
}

/** Τα έξοδα οχήματος της περιόδου (ο οδηγός βλέπει μόνο του δικού του αυτοκινήτου — RLS). */
export async function fetchExpenses(supabase: BrowserSupabase, query: ShiftQuery): Promise<ExpenseRow[]> {
  const rows: ExpenseRow[] = [];
  let total = Infinity;

  while (rows.length < total) {
    let request = supabase.from('vehicle_expenses').select('*', { count: 'exact' }).eq('year', query.year);
    if (query.month !== 'all') request = request.eq('month', query.month);
    if (query.driverId) request = request.eq('driver_id', query.driverId);

    const { data, error, count } = await request
      .order('month', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(rows.length, rows.length + PAGE_SIZE - 1);
    if (error) throw error;

    total = count ?? rows.length + data.length;
    rows.push(...data);
    if (data.length === 0) break;
  }
  return rows;
}

export async function insertExpense(supabase: BrowserSupabase, payload: ExpenseInsert): Promise<ExpenseRow> {
  const { data, error } = await supabase.from('vehicle_expenses').insert(payload).select('*').single();
  if (error) throw error;
  return data;
}

/** Η διορθωμένη εγγραφή, ή null αν δεν επιτρέπεται (π.χ. οδηγός μετά από 24 ώρες). */
export async function updateExpense(
  supabase: BrowserSupabase,
  id: string,
  changes: TablesUpdate<'vehicle_expenses'>,
): Promise<ExpenseRow | null> {
  const { data, error } = await supabase.from('vehicle_expenses').update(changes).eq('id', id).select('*');
  if (error) throw error;
  return data[0] ?? null;
}

/** true αν διαγράφηκε· false αν δεν επιτρέπεται. */
export async function deleteExpense(supabase: BrowserSupabase, id: string): Promise<boolean> {
  const { data, error } = await supabase.from('vehicle_expenses').delete().eq('id', id).select('id');
  if (error) throw error;
  return data.length > 0;
}

/** Οι καταχωρήσεις εφαρμογών της περιόδου (ο οδηγός βλέπει μόνο του δικού του αυτοκινήτου — RLS). */
export async function fetchStatements(supabase: BrowserSupabase, query: ShiftQuery): Promise<StatementRow[]> {
  const rows: StatementRow[] = [];
  let total = Infinity;

  while (rows.length < total) {
    let request = supabase.from('platform_statements').select('*', { count: 'exact' }).eq('year', query.year);
    if (query.month !== 'all') request = request.eq('month', query.month);
    if (query.driverId) request = request.eq('driver_id', query.driverId);

    const { data, error, count } = await request
      .order('month', { ascending: false })
      .order('week_start', { ascending: false, nullsFirst: true })
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(rows.length, rows.length + PAGE_SIZE - 1);
    if (error) throw error;

    total = count ?? rows.length + data.length;
    rows.push(...data);
    if (data.length === 0) break;
  }
  return rows;
}

export async function insertStatement(supabase: BrowserSupabase, payload: StatementInsert): Promise<StatementRow> {
  const { data, error } = await supabase.from('platform_statements').insert(payload).select('*').single();
  if (error) throw error;
  return data;
}

/** Η διορθωμένη εγγραφή, ή null αν δεν επιτρέπεται (π.χ. οδηγός μετά από 24 ώρες). */
export async function updateStatement(
  supabase: BrowserSupabase,
  id: string,
  changes: TablesUpdate<'platform_statements'>,
): Promise<StatementRow | null> {
  const { data, error } = await supabase.from('platform_statements').update(changes).eq('id', id).select('*');
  if (error) throw error;
  return data[0] ?? null;
}

/** Τα ποσοστά κράτησης των εφαρμογών (ο οδηγός βλέπει μόνο του δικού του αυτοκινήτου — RLS). */
export async function fetchPlatformRates(supabase: BrowserSupabase): Promise<PlatformRateRow[]> {
  const { data, error } = await supabase.from('platform_rates').select('*');
  if (error) throw error;
  return data;
}

/** Ορισμός ή αλλαγή του ποσοστού μιας εφαρμογής για ένα αυτοκίνητο. */
export async function savePlatformRate(supabase: BrowserSupabase, payload: PlatformRateInsert): Promise<PlatformRateRow> {
  const { data, error } = await supabase
    .from('platform_rates')
    .upsert(payload, { onConflict: 'driver_id,platform' })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/** «Δουλεύει με» μια εφαρμογή ή όχι, για ένα αυτοκίνητο που έχει ήδη ποσοστό (το ποσοστό μένει). */
export async function setPlatformActive(
  supabase: BrowserSupabase,
  driverId: string,
  platform: string,
  active: boolean,
): Promise<PlatformRateRow> {
  const { data, error } = await supabase
    .from('platform_rates')
    .update({ active })
    .eq('driver_id', driverId)
    .eq('platform', platform)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/** true αν διαγράφηκε· false αν δεν επιτρέπεται. */
export async function deleteStatement(supabase: BrowserSupabase, id: string): Promise<boolean> {
  const { data, error } = await supabase.from('platform_statements').delete().eq('id', id).select('id');
  if (error) throw error;
  return data.length > 0;
}

export async function fetchDrivers(supabase: BrowserSupabase): Promise<DriverRow[]> {
  const { data, error } = await supabase.from('drivers').select('*').order('name');
  if (error) throw error;
  return data;
}

export interface DriverInput {
  name: string;
  plate: string;
  phone: string;
  email: string;
  /** Καύσιμο του αυτοκινήτου (όρια του μετρητή αξιοποίησης)· κενό = δεν δηλώθηκε. */
  fuel: Fuel | '';
}

function driverPayload(input: DriverInput) {
  return {
    name: input.name.trim(),
    plate: input.plate.trim() || null,
    phone: input.phone.trim() || null,
    email: input.email.trim().toLowerCase() || null,
    fuel: input.fuel || null,
  };
}

export async function createDriver(supabase: BrowserSupabase, input: DriverInput): Promise<DriverRow> {
  const { data, error } = await supabase.from('drivers').insert(driverPayload(input)).select('*').single();
  if (error) throw error;
  return data;
}

export async function updateDriver(
  supabase: BrowserSupabase,
  id: string,
  changes: Partial<DriverInput> & { active?: boolean },
): Promise<DriverRow> {
  const payload: TablesUpdate<'drivers'> = {};
  if (changes.name !== undefined) payload.name = changes.name.trim();
  if (changes.plate !== undefined) payload.plate = changes.plate.trim() || null;
  if (changes.phone !== undefined) payload.phone = changes.phone.trim() || null;
  if (changes.email !== undefined) payload.email = changes.email.trim().toLowerCase() || null;
  if (changes.fuel !== undefined) payload.fuel = changes.fuel || null;
  if (changes.active !== undefined) payload.active = changes.active;

  const { data, error } = await supabase.from('drivers').update(payload).eq('id', id).select('*').single();
  if (error) throw error;
  return data;
}

export async function deleteDriver(supabase: BrowserSupabase, id: string): Promise<void> {
  const { error } = await supabase.from('drivers').delete().eq('id', id);
  if (error) throw error;
}

/**
 * «Έχω δικό μου ταξί»: νέος στόλος με τον χρήστη ιδιοκτήτη και το πρώτο αυτοκίνητο
 * (το όνομά του, η πινακίδα και το καύσιμο), συνδεδεμένο με τον λογαριασμό του.
 */
export async function createFleet(
  supabase: BrowserSupabase,
  input: { name: string; plate: string; fuel: Fuel },
): Promise<void> {
  const { error } = await supabase.rpc('create_fleet', {
    p_name: input.name.trim(),
    p_plate: input.plate.trim() || undefined,
    p_fuel: input.fuel,
  });
  if (error) throw error;
}

/** «Αποδοχή» πρόσκλησης ενός ιδιοκτήτη. `false` αν η πρόσκληση δεν ισχύει πια. */
export async function acceptInvite(supabase: BrowserSupabase, driverId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('accept_invite', { p_driver_id: driverId });
  if (error) throw error;
  return data;
}

/** Όλες οι γραμμές ενός πίνακα για το αντίγραφο ασφαλείας (ό,τι επιτρέπει το RLS: ο ιδιοκτήτης όλο τον στόλο του). */
export async function fetchBackupTable(supabase: BrowserSupabase, table: BackupTable): Promise<unknown[]> {
  const rows: unknown[] = [];
  let total = Infinity;

  while (rows.length < total) {
    const request = supabase.from(table).select('*', { count: 'exact' });
    // Σταθερή σειρά, ώστε οι σελίδες να μην επικαλύπτονται ούτε να αφήνουν κενά.
    const ordered = table === 'platform_rates' ? request.order('driver_id').order('platform') : request.order('id');
    const { data, error, count } = await ordered.range(rows.length, rows.length + PAGE_SIZE - 1);
    if (error) throw error;

    total = count ?? rows.length + data.length;
    rows.push(...data);
    if (data.length === 0) break;
  }
  return rows;
}
