'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { hasSeenWelcome } from '@/lib/storage';

/** Σε κάθε σελίδα: service worker (κανονική έκδοση) και «Καλώς ήρθατε» την πρώτη φορά σε κάθε συσκευή. */
export function AppSetup() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {
      // Χωρίς service worker η εφαρμογή δουλεύει κανονικά, απλώς χωρίς τη σελίδα «Χωρίς σύνδεση».
    });
  }, []);

  useEffect(() => {
    // Μόνο στην αρχική και στη σύνδεση, χωρίς παραμέτρους (π.χ. όχι πάνω στο «το email επιβεβαιώθηκε»).
    if ((pathname !== '/' && pathname !== '/login') || window.location.search || hasSeenWelcome()) return;
    router.replace(`/welcome?next=${encodeURIComponent(pathname)}`);
  }, [pathname, router]);

  return null;
}
