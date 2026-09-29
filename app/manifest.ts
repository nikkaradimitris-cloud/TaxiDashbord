import type { MetadataRoute } from 'next';

/**
 * Εγκατάσταση στο κινητό («Προσθήκη στην αρχική οθόνη»): εικονίδιο, όνομα, πλήρης οθόνη.
 * Τα PNG βγαίνουν από τα SVG με `node scripts/icons.mjs`. Το σκούρο φόντο είναι αυτό που δείχνει
 * το Android μέχρι να φορτώσει η εφαρμογή· ταιριάζει με την κίνηση του ανοίγματος (Splash).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Taxi Fleet Tracker',
    short_name: 'Taxi Fleet',
    description: 'Βάρδιες, ΦΠΑ και ταμείο στόλου ταξί',
    lang: 'el',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0b1020',
    theme_color: '#0b1020',
    categories: ['business', 'finance', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
