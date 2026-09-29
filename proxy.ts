import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/proxy';

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Όλες οι σελίδες εκτός από στατικά αρχεία και εικόνες (και τα αρχεία του service worker:
    // πρέπει να φτάνουν και χωρίς σύνδεση λογαριασμού, χωρίς ανακατεύθυνση).
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|sw.js|offline.html|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
