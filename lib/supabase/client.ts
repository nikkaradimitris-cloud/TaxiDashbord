import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/lib/database.types';
import { getSupabaseConfig } from './config';

/** Supabase client για Client Components (η συνεδρία ζει σε cookies). */
export function createClient() {
  const config = getSupabaseConfig();
  if (!config) throw new Error('Το Supabase δεν έχει ρυθμιστεί (βλ. .env.example).');
  return createBrowserClient<Database>(config.url, config.key);
}

export type BrowserSupabase = ReturnType<typeof createClient>;
