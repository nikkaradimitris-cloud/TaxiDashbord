import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/** Μόνο διαδρομές της ίδιας εφαρμογής (προστασία από open redirect, π.χ. "//x" ή "/\x"). */
function safeNext(value: string | null, request: NextRequest): string {
  if (!value || !value.startsWith('/')) return '/';
  const target = new URL(value, request.url);
  return target.origin === request.nextUrl.origin ? `${target.pathname}${target.search}` : '/';
}

/**
 * Προορισμός των συνδέσμων από τα email του Supabase
 * (επιβεβαίωση εγγραφής, επαναφορά κωδικού).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const next = safeNext(searchParams.get('next'), request);
  const isRecovery = next === '/update-password' || searchParams.get('type') === 'recovery';
  const failure = isRecovery ? '/forgot-password?error=link' : '/login?error=link';
  const go = (path: string) => NextResponse.redirect(new URL(path, request.url));

  if (searchParams.get('error') || searchParams.get('error_description')) {
    return go(failure);
  }

  const supabase = await createClient();
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return go(next);
    // Ο σύνδεσμος άνοιξε σε άλλον browser/συσκευή: το email έχει ήδη
    // επιβεβαιωθεί, αρκεί μια κανονική σύνδεση.
    return go(isRecovery ? failure : '/login?message=confirmed');
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return go(isRecovery ? '/update-password' : next);
  }

  return go(failure);
}
