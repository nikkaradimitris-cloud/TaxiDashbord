'use client';

import { useState } from 'react';
import { Logo } from '@/components/Logo';
import { CityScene } from './CityScene';
import { ROUTES, SPLASH_TIPS } from './scenes';

// Ποιο μήνυμα και ποια διαδρομή δείχνει αυτό το άνοιγμα: τα διαλέγει το script του app/layout.tsx πριν
// εμφανιστεί η σελίδα (`data-tip`, `data-route` στο <html>). Εδώ υπάρχουν όλα και αυτοί οι κανόνες
// κρατούν ορατό μόνο το σωστό (χωρίς `data-route`: η πρώτη διαδρομή).
const CHOICE_CSS = [
  ...SPLASH_TIPS.map((_, i) => `:root[data-tip='${i}'] .intro-tip[data-tip='${i}']{display:flex}`),
  ":root:not([data-route]) .intro-route-set[data-route]:not([data-route='0']){display:none}",
  ...ROUTES.map((_, i) => `:root[data-route='${i}'] .intro-route-set[data-route]:not([data-route='${i}']){display:none}`),
].join('');

/**
 * Κίνηση ανοίγματος: μία φορά σε κάθε άνοιγμα της εφαρμογής. Καλύπτει τον χρόνο που φορτώνουν τα
 * στοιχεία και ένα πάτημα την κλείνει. Την πρώτη φορά (πριν από το «Καλώς ήρθατε») δείχνει μόνο το
 * λογότυπο· μετά, κάθε άνοιγμα άλλη διαδρομή και μία άλλη δυνατότητα της εφαρμογής. Αν έχει ήδη παιχτεί
 * σε αυτό το άνοιγμα, ή το κινητό ζητά «μείωση κίνησης», δεν φαίνεται καθόλου (app/intro.css).
 */
export function Splash() {
  const [state, setState] = useState<'playing' | 'skipping' | 'gone'>('playing');
  if (state === 'gone') return null;

  return (
    <div
      className="intro-splash intro-dark"
      data-skip={state === 'skipping'}
      data-testid="splash"
      aria-hidden="true"
      onClick={() => setState('skipping')}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget && event.animationName === 'intro-out') setState('gone');
      }}
    >
      <style href="intro-splash-choice" precedence="default">
        {CHOICE_CSS}
      </style>
      <div className="intro-dots" />
      <CityScene mode="once" variants />
      <div className="intro-brand">
        <span className="intro-logo-wrap">
          <Logo className="h-full w-full" />
        </span>
        <p className="intro-title">Taxi Fleet Tracker</p>
        <p className="intro-tagline">Βάρδιες · ΦΠΑ · Ταμείο</p>
        {SPLASH_TIPS.map((tip, i) => (
          <p key={tip} className="intro-tip intro-glass" data-tip={i}>
            <svg viewBox="0 0 24 24">
              <path d="M12 2l2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6z" />
            </svg>
            {tip}
          </p>
        ))}
      </div>
    </div>
  );
}
