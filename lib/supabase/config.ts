/**
 * Ρυθμίσεις σύνδεσης με το Supabase.
 *
 * Το URL και το publishable key του project είναι σχεδιασμένα να είναι δημόσια
 * (τα λαμβάνει ο browser κάθε επισκέπτη· την ασφάλεια την κάνει το RLS της βάσης),
 * γι' αυτό υπάρχουν εδώ και η εφαρμογή δουλεύει χωρίς μεταβλητές περιβάλλοντος.
 * Για άλλο project ή τοπικό Supabase, ορίστε ΚΑΙ ΤΙΣ ΔΥΟ μεταβλητές
 * NEXT_PUBLIC_SUPABASE_URL και NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (ή το παλιό
 * NEXT_PUBLIC_SUPABASE_ANON_KEY). Ποτέ το secret / service_role key.
 */
export const PROJECT_SUPABASE_URL = 'https://gayduuruaklfagdtzhyf.supabase.co';
export const PROJECT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_k9FJbua_xa0RB5Fx5nymfA_1LkcsWUi';

export interface SupabaseConfig {
  url: string;
  key: string;
}

/** Κενή τιμή ή τιμή-παράδειγμα («xxxx…», π.χ. από το .env.example) = δεν έχει οριστεί. */
function envValue(value: string | undefined): string {
  const trimmed = (value ?? '').trim();
  return /x{6,}/i.test(trimmed) ? '' : trimmed;
}

/** Οι μεταβλητές περιβάλλοντος αν έχουν οριστεί και οι δύο, αλλιώς οι τιμές του project. */
export function resolveSupabaseConfig(env: { url?: string; publishableKey?: string; anonKey?: string }): SupabaseConfig {
  const url = envValue(env.url);
  const key = envValue(env.publishableKey) || envValue(env.anonKey);
  return url && key ? { url, key } : { url: PROJECT_SUPABASE_URL, key: PROJECT_SUPABASE_PUBLISHABLE_KEY };
}

const { url, key } = resolveSupabaseConfig({
  url: process.env.NEXT_PUBLIC_SUPABASE_URL,
  publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});

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
