import { createServerClient } from '@supabase/ssr';
import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/lib/database.types';
import { getSupabaseConfig } from './config';

/** Σελίδες που ανοίγουν χωρίς σύνδεση. */
const PUBLIC_PATHS = ['/login', '/register', '/forgot-password', '/auth'];
/** Σελίδες που δεν έχουν νόημα για ήδη συνδεδεμένο χρήστη. */
const GUEST_ONLY_PATHS = ['/login', '/register'];

function matches(pathname: string, paths: string[]) {
  return paths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Ανανεώνει τη συνεδρία Supabase σε κάθε αίτημα και στέλνει τους μη
 * συνδεδεμένους στη σελίδα σύνδεσης. Η πραγματική προστασία των δεδομένων
 * γίνεται από το Row Level Security της βάσης.
 */
export async function updateSession(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // Αν το Supabase έστειλε τον χρήστη στο Site URL (π.χ. /?code=…) αντί για
  // /auth/callback, ολοκληρώνουμε κανονικά την επιβεβαίωση.
  if (pathname === '/' && (searchParams.has('code') || searchParams.has('token_hash'))) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/callback';
    return NextResponse.redirect(url);
  }

  let response = NextResponse.next({ request });
  const config = getSupabaseConfig();
  if (!config) return response; // η αρχική σελίδα δείχνει οδηγίες ρύθμισης

  const supabase = createServerClient<Database>(config.url, config.key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // Μην προσθέσετε κώδικα ανάμεσα στη δημιουργία του client και στο getClaims().
  let signedIn = false;
  try {
    const { data, error } = await supabase.auth.getClaims();
    if (error && isAuthRetryableFetchError(error)) return response; // πρόβλημα δικτύου: η σελίδα θα το δείξει
    signedIn = Boolean(data?.claims?.sub);
  } catch {
    return response;
  }

  const redirectTo = (target: string) => {
    const url = request.nextUrl.clone();
    url.pathname = target;
    url.search = '';
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  };

  if (!signedIn && !matches(pathname, PUBLIC_PATHS)) return redirectTo('/login');
  if (signedIn && matches(pathname, GUEST_ONLY_PATHS)) return redirectTo('/');
  return response;
}
