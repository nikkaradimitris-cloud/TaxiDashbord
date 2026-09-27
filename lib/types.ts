import type { Tables, TablesInsert } from './database.types';

export type DriverRow = Tables<'drivers'>;
export type ShiftRow = Tables<'shifts'>;
export type ProfileRow = Tables<'profiles'>;
export type ShiftInsert = TablesInsert<'shifts'>;

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
