/**
 * Εγκατάσταση στο κινητό («Προσθήκη στην αρχική οθόνη»).
 *  - Android (Chrome κ.ά.): ο browser δίνει το γεγονός «beforeinstallprompt»· το κρατάμε για το κουμπί
 *    «Εγκατάσταση». Το πιάνει ήδη το script του app/layout.tsx, πριν φορτώσει η εφαρμογή.
 *  - iPhone: δεν υπάρχει κουμπί· δείχνουμε τα δύο βήματα από το «Κοινοποίηση».
 */

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

declare global {
  interface Window {
    /** Το γεγονός που κράτησε το script του app/layout.tsx πριν φορτώσει η εφαρμογή. */
    __taxiInstallPrompt?: InstallPromptEvent;
  }
}

/**
 * - `installed`: ανοιχτή ήδη ως εφαρμογή (πλήρης οθόνη) ή μόλις εγκαταστάθηκε,
 * - `available`: ο browser επιτρέπει το κουμπί «Εγκατάσταση»,
 * - `ios`: iPhone/iPad στον browser (οδηγίες),
 * - `unknown`: τίποτα από τα παραπάνω (π.χ. υπολογιστής, ήδη εγκατεστημένη σε άλλο παράθυρο).
 */
export type InstallState = 'installed' | 'available' | 'ios' | 'unknown';

let installedNow = false;
let snapshot: InstallState | null = null;
const listeners = new Set<() => void>();

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

function compute(): InstallState {
  if (installedNow || isStandalone()) return 'installed';
  if (window.__taxiInstallPrompt) return 'available';
  if (isIos()) return 'ios';
  return 'unknown';
}

function update() {
  snapshot = compute();
  listeners.forEach((listener) => listener());
}

export function subscribeInstall(listener: () => void) {
  listeners.add(listener);
  const onPrompt = (event: Event) => {
    event.preventDefault(); // όχι η δική του λωρίδα του browser: το κουμπί της εφαρμογής
    window.__taxiInstallPrompt = event as InstallPromptEvent;
    update();
  };
  const onInstalled = () => {
    installedNow = true;
    window.__taxiInstallPrompt = undefined;
    update();
  };
  window.addEventListener('beforeinstallprompt', onPrompt);
  window.addEventListener('appinstalled', onInstalled);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('beforeinstallprompt', onPrompt);
    window.removeEventListener('appinstalled', onInstalled);
  };
}

export function getInstallState(): InstallState {
  return (snapshot ??= compute());
}

/** Στον server δεν ξέρουμε τίποτα: κανένα κουμπί μέχρι να φορτώσει η σελίδα. */
export function getServerInstallState(): InstallState {
  return 'unknown';
}

/** Το παράθυρο εγκατάστασης του browser. `true` αν ο χρήστης είπε «Εγκατάσταση». */
export async function promptInstall(): Promise<boolean> {
  const event = window.__taxiInstallPrompt;
  if (!event) return false;
  window.__taxiInstallPrompt = undefined; // κάθε γεγονός χρησιμοποιείται μία φορά
  await event.prompt();
  const { outcome } = await event.userChoice;
  if (outcome === 'accepted') installedNow = true;
  update();
  return outcome === 'accepted';
}
