import type { ReactNode } from 'react';

/**
 * «Πρώτα βάλτε την εφαρμογή»: το αρχείο Excel του αντιγράφου ανοίγει στο κινητό μόνο με εφαρμογή για
 * υπολογιστικά φύλλα. Κουμπιά για τα «Υπολογιστικά φύλλα Google» (δωρεάν) στο Google Play και στο App Store.
 */
export const SHEETS_PLAY_URL = 'https://play.google.com/store/apps/details?id=com.google.android.apps.docs.editors.sheets&hl=el';
export const SHEETS_APP_STORE_URL = 'https://apps.apple.com/gr/app/google-sheets/id842849113';

export function SheetsApp({ compact = false }: { compact?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-bg p-3" data-testid="sheets-app">
      <div className="flex items-start gap-3">
        <SheetsIcon />
        <div className="min-w-0">
          <p className="font-semibold">
            {compact ? 'Δεν ανοίγει;' : 'Πρώτα:'} η εφαρμογή «Υπολογιστικά φύλλα Google»
          </p>
          <p className="text-muted">
            {compact
              ? 'Βάλτε τη δωρεάν και ανοίξτε ξανά το αρχείο από τις «Λήψεις».'
              : 'Δωρεάν. Βάλτε τη στο κινητό πριν από το κατέβασμα, για να ανοίγει το αρχείο.'}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <StoreLink href={SHEETS_PLAY_URL} store="Google Play" icon={<PlayIcon />} />
        <StoreLink href={SHEETS_APP_STORE_URL} store="App Store" icon={<PhoneIcon />} />
      </div>
    </div>
  );
}

function StoreLink({ href, store, icon }: { href: string; store: string; icon: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-black px-3 py-1.5 text-white ring-1 ring-white/15 hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong"
    >
      {icon}
      <span className="leading-tight">
        <span className="block text-[11px] text-white/80">Κατεβάστε από το</span>
        <span className="block text-base font-semibold">{store}</span>
      </span>
    </a>
  );
}

/** Πράσινο φύλλο με πίνακα, σαν τα υπολογιστικά φύλλα. */
function SheetsIcon() {
  return (
    <svg viewBox="0 0 40 48" className="h-11 w-9 shrink-0" aria-hidden="true">
      <path d="M4 0h23l13 13v31a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4V4a4 4 0 0 1 4-4z" fill="#0f9d58" />
      <path d="M27 0l13 13H31a4 4 0 0 1-4-4z" fill="#87ceac" />
      <path d="M9 22h22v16H9zM9 27.5h22M9 32.5h22M17 22v16" fill="none" stroke="#fff" strokeWidth="2.2" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0" aria-hidden="true">
      <path d="M5 3.5v17a1 1 0 0 0 1.5.86l14-8.5a1 1 0 0 0 0-1.72l-14-8.5A1 1 0 0 0 5 3.5z" fill="currentColor" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
      <path d="M10.5 18.5h3" strokeLinecap="round" />
    </svg>
  );
}
