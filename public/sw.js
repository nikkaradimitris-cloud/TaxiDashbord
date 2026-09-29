/*
 * Service worker της εφαρμογής: μόνο για το άνοιγμα χωρίς σήμα.
 * Οι σελίδες έρχονται πάντα από το δίκτυο· αν δεν υπάρχει σύνδεση, δείχνει τη σελίδα «Χωρίς σύνδεση».
 * Δεν κρατά στοιχεία (βάρδιες, λογαριασμούς) ούτε σελίδες με στοιχεία. Για αλλαγή: νέο όνομα στο CACHE.
 */
const CACHE = 'taxi-fleet-offline-v1';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(OFFLINE_URL)) // αυτοτελής σελίδα (εικόνα και στυλ μέσα της)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
      // Η σελίδα ζητείται από το δίκτυο όσο ξεκινά ο service worker (πιο γρήγορο άνοιγμα).
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return; // όλα τα άλλα (στοιχεία, αρχεία) όπως πάντα
  event.respondWith(
    (async () => {
      try {
        return (await event.preloadResponse) || (await fetch(event.request));
      } catch {
        return (await caches.match(OFFLINE_URL)) || Response.error();
      }
    })(),
  );
});
