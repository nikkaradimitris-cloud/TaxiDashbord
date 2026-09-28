import type { Tables, TablesInsert } from './database.types';

export type DriverRow = Tables<'drivers'>;
export type ShiftRow = Tables<'shifts'>;
export type ProfileRow = Tables<'profiles'>;
export type ShiftInsert = TablesInsert<'shifts'>;
/** Έξοδο οχήματος εκτός βάρδιας («Επισκευές / Συντήρηση» ή «Άλλα έξοδα»). */
export type ExpenseRow = Tables<'vehicle_expenses'>;
export type ExpenseInsert = TablesInsert<'vehicle_expenses'>;
/** Εφαρμογή (Uber / FreeNow / Bolt): εβδομαδιαία κίνηση ή μηνιαίο τιμολόγιο. */
export type StatementRow = Tables<'platform_statements'>;
export type StatementInsert = TablesInsert<'platform_statements'>;
/** Ποσοστό κράτησης μιας εφαρμογής για ένα αυτοκίνητο (και αν το τιμολόγιο έχει ΦΠΑ). */
export type PlatformRateRow = Tables<'platform_rates'>;
export type PlatformRateInsert = TablesInsert<'platform_rates'>;

export type Role = 'admin' | 'driver';

/** Ο συνδεδεμένος χρήστης όπως τον βλέπει το dashboard. */
export interface SessionInfo {
  userId: string;
  email: string;
  fullName: string;
  role: Role;
  /** Η εγγραφή στόλου του χρήστη (υποχρεωτική για οδηγό, προαιρετική για admin). */
  ownDriver: DriverRow | null;
}
