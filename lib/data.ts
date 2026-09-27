/**
 * Πρόσβαση στα δεδομένα από τον browser. Κάθε ερώτημα τρέχει με τα
 * δικαιώματα του συνδεδεμένου χρήστη· το Row Level Security της βάσης
 * αποφασίζει τι βλέπει ο καθένας (admin: όλα, οδηγός: μόνο τα δικά του).
 */
import type { MonthFilter } from './period';
import type { BrowserSupabase } from './supabase/client';
import type { TablesUpdate } from './database.types';
import type { DriverRow, ProfileRow, ShiftInsert, ShiftRow } from './types';

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

/** Υπάρχει ήδη βάρδια με τον ίδιο αριθμό Ζ για τον οδηγό; */
export async function findShiftByZ(
  supabase: BrowserSupabase,
  driverId: string,
  zNumber: string,
): Promise<ShiftRow | null> {
  const { data, error } = await supabase
    .from('shifts')
    .select('*')
    .eq('driver_id', driverId)
    .eq('z_number', zNumber.trim())
    .limit(1);
  if (error) throw error;
  return data[0] ?? null;
}

/** true αν διαγράφηκε· false αν δεν επιτρέπεται (π.χ. οδηγός μετά από 24 ώρες). */
export async function deleteShift(supabase: BrowserSupabase, id: string): Promise<boolean> {
  const { data, error } = await supabase.from('shifts').delete().eq('id', id).select('id');
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
}

function driverPayload(input: DriverInput) {
  return {
    name: input.name.trim(),
    plate: input.plate.trim() || null,
    phone: input.phone.trim() || null,
    email: input.email.trim().toLowerCase() || null,
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
  if (changes.active !== undefined) payload.active = changes.active;

  const { data, error } = await supabase.from('drivers').update(payload).eq('id', id).select('*').single();
  if (error) throw error;
  return data;
}

export async function deleteDriver(supabase: BrowserSupabase, id: string): Promise<void> {
  const { error } = await supabase.from('drivers').delete().eq('id', id);
  if (error) throw error;
}

/** Όλα τα προφίλ (μόνο ο admin τα βλέπει όλα). */
export async function fetchProfiles(supabase: BrowserSupabase): Promise<ProfileRow[]> {
  const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}
