import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/lib/database.types';
import { getSupabaseConfig } from './config';

/** Supabase client για Server Components και Route Handlers (νέος σε κάθε αίτημα). */
export async function createClient() {
  const config = getSupabaseConfig();
  if (!config) throw new Error('Το Supabase δεν έχει ρυθμιστεί (βλ. .env.example).');
  const cookieStore = await cookies();

  return createServerClient<Database>(config.url, config.key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Σε Server Component δεν γράφονται cookies· την ανανέωση την κάνει ο proxy.
        }
      },
    },
  });
}
