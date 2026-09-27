/**
 * Ρυθμίσεις σύνδεσης με το Supabase (από .env.local ή τις μεταβλητές του Vercel).
 *
 * Δεκτά ονόματα κλειδιού: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (νέο, sb_publishable_…)
 * ή NEXT_PUBLIC_SUPABASE_ANON_KEY (παλιό anon JWT). Ποτέ το secret / service_role.
 */
const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
const key = (
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  ''
).trim();

export interface SupabaseConfig {
  url: string;
  key: string;
}

/** Ρόλος που αναγράφεται μέσα σε παλιού τύπου κλειδί JWT (anon / service_role). */
function jwtRole(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

/** Ελληνικό μήνυμα για λάθος ρύθμιση, ή null αν όλα είναι σωστά. */
export function checkSupabaseConfig(config: SupabaseConfig = { url, key }): string | null {
  if (!config.url || !config.key) {
    return 'Λείπουν οι μεταβλητές NEXT_PUBLIC_SUPABASE_URL και NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.';
  }
  let parsed: URL;
  try {
    parsed = new URL(config.url);
  } catch {
    return 'Το NEXT_PUBLIC_SUPABASE_URL δεν είναι έγκυρη διεύθυνση (π.χ. https://abcd1234.supabase.co).';
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return 'Το NEXT_PUBLIC_SUPABASE_URL πρέπει να ξεκινά με https://';
  }
  if (parsed.hostname.endsWith('supabase.com')) {
    return 'Το NEXT_PUBLIC_SUPABASE_URL είναι η σελίδα του dashboard. Βάλτε το "Project URL" (https://…supabase.co) από Project Settings → API.';
  }
  if (config.key.startsWith('sb_secret_') || jwtRole(config.key) === 'service_role') {
    return 'Χρησιμοποιείτε το ΜΥΣΤΙΚΟ κλειδί (secret / service_role). Βάλτε το publishable (ή anon) κλειδί — το μυστικό δεν πρέπει ποτέ να φτάνει στον browser.';
  }
  return null;
}

/** Οι ρυθμίσεις αν είναι σωστές, αλλιώς null. */
export function getSupabaseConfig(): SupabaseConfig | null {
  const config = { url, key };
  return checkSupabaseConfig(config) ? null : config;
}
