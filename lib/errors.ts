/** Μετάφραση σφαλμάτων Supabase σε κατανοητά ελληνικά μηνύματα. */

interface ErrorLike {
  code?: string;
  message?: string;
  name?: string;
  status?: number;
}

function asErrorLike(error: unknown): ErrorLike {
  if (error && typeof error === 'object') return error as ErrorLike;
  return { message: String(error ?? '') };
}

export const NETWORK_MESSAGE =
  'Δεν υπάρχει σύνδεση με τον server. Ελέγξτε το internet και δοκιμάστε ξανά.';

/** Σφάλμα δικτύου (όχι λάθος δεδομένων) — η ενέργεια μπορεί να ξαναδοκιμαστεί. */
export function isNetworkError(error: unknown): boolean {
  const e = asErrorLike(error);
  if (e.name === 'AuthRetryableFetchError') return true;
  const message = (e.message ?? '').toLowerCase();
  return (
    (e.name === 'TypeError' && message.includes('fetch')) ||
    message.includes('failed to fetch') ||
    message.includes('fetch failed') ||
    message.includes('networkerror') ||
    message.includes('network request failed') ||
    message.includes('load failed')
  );
}

/** Ο πίνακας/συνάρτηση δεν υπάρχει: δεν έχει εκτελεστεί το SQL της βάσης. */
export function isMissingSchemaError(error: unknown): boolean {
  const e = asErrorLike(error);
  return e.code === 'PGRST205' || e.code === 'PGRST202' || e.code === '42P01' || e.code === '42883';
}

const AUTH_MESSAGES: Record<string, string> = {
  invalid_credentials: 'Λάθος email ή κωδικός.',
  email_not_confirmed: 'Δεν έχετε επιβεβαιώσει ακόμη το email σας. Ανοίξτε τον σύνδεσμο που σας στείλαμε.',
  user_already_exists: 'Υπάρχει ήδη λογαριασμός με αυτό το email.',
  email_exists: 'Υπάρχει ήδη λογαριασμός με αυτό το email.',
  weak_password: 'Ο κωδικός είναι πολύ αδύναμος. Χρησιμοποιήστε τουλάχιστον 8 χαρακτήρες.',
  same_password: 'Ο νέος κωδικός πρέπει να είναι διαφορετικός από τον παλιό.',
  over_email_send_rate_limit: 'Στάλθηκαν πολλά email. Περιμένετε λίγα λεπτά και δοκιμάστε ξανά.',
  over_request_rate_limit: 'Πολλές προσπάθειες. Περιμένετε λίγα λεπτά και δοκιμάστε ξανά.',
  signup_disabled: 'Οι νέες εγγραφές είναι απενεργοποιημένες. Επικοινωνήστε με τον ιδιοκτήτη.',
  email_address_invalid: 'Το email δεν είναι έγκυρο.',
  validation_failed: 'Ελέγξτε ότι το email και ο κωδικός είναι σωστά.',
  session_not_found: 'Η συνεδρία έληξε. Συνδεθείτε ξανά.',
  otp_expired: 'Ο σύνδεσμος έχει λήξει. Ζητήστε νέο.',
};

export function authErrorMessage(error: unknown): string {
  const e = asErrorLike(error);
  if (isNetworkError(e)) return NETWORK_MESSAGE;
  if (e.code && AUTH_MESSAGES[e.code]) return AUTH_MESSAGES[e.code];
  if (/invalid login credentials/i.test(e.message ?? '')) return AUTH_MESSAGES.invalid_credentials;
  if (/email not confirmed/i.test(e.message ?? '')) return AUTH_MESSAGES.email_not_confirmed;
  if (/password should be at least/i.test(e.message ?? '')) return AUTH_MESSAGES.weak_password;
  return e.message || 'Κάτι πήγε στραβά. Δοκιμάστε ξανά.';
}

export function dataErrorMessage(error: unknown): string {
  const e = asErrorLike(error);
  if (isNetworkError(e)) return NETWORK_MESSAGE;
  if (isMissingSchemaError(e)) {
    return 'Η βάση δεν έχει ρυθμιστεί: εκτελέστε το αρχείο SQL (supabase/migrations) στο Supabase → SQL Editor.';
  }
  switch (e.code) {
    case '42501':
      return 'Δεν έχετε δικαίωμα για αυτή την ενέργεια.';
    case '23505':
      if ((e.message ?? '').includes('platform_statements_week_key')) {
        return 'Αυτή η εβδομάδα έχει ήδη καταχωρηθεί για την εφαρμογή και το αυτοκίνητο. Διορθώστε την από τη λίστα «Εφαρμογές».';
      }
      if ((e.message ?? '').includes('platform_statements_invoice_key')) {
        return 'Υπάρχει ήδη τιμολόγιο της εφαρμογής για τον μήνα. Διορθώστε το από τη λίστα «Εφαρμογές».';
      }
      return (e.message ?? '').includes('email')
        ? 'Το email το έχει ήδη άλλος οδηγός του στόλου σας.'
        : 'Η εγγραφή υπάρχει ήδη.';
    case '23503':
      return 'Ο οδηγός έχει καταχωρημένες βάρδιες και δεν μπορεί να διαγραφεί. Απενεργοποιήστε τον.';
    case '23514':
      return 'Κάποια τιμή δεν είναι έγκυρη (π.χ. αρνητικό ποσό ή κενός αριθμός Ζ).';
    case 'PGRST301':
    case 'PGRST303':
      return 'Η συνεδρία έληξε. Συνδεθείτε ξανά.';
    default:
      return e.message || 'Κάτι πήγε στραβά. Δοκιμάστε ξανά.';
  }
}
