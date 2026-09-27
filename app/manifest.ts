import type { MetadataRoute } from 'next';

/** Επιτρέπει «Προσθήκη στην αρχική οθόνη» στο κινητό του οδηγού. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Taxi Fleet Tracker',
    short_name: 'Taxi Fleet',
    description: 'Βάρδιες, ΦΠΑ και ταμείο στόλου ταξί',
    lang: 'el',
    start_url: '/',
    display: 'standalone',
    background_color: '#f3f4f6',
    theme_color: '#facc15',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}
