'use client';

import { useState } from 'react';
import { Logo } from '@/components/Logo';
import { CityScene } from './CityScene';

/**
 * Κίνηση ανοίγματος (περίπου 1,7 δευτ.): μία φορά σε κάθε άνοιγμα της εφαρμογής. Καλύπτει τον χρόνο
 * που φορτώνουν τα στοιχεία και ένα πάτημα την κλείνει. Αν έχει ήδη παιχτεί σε αυτό το άνοιγμα, ή το
 * κινητό ζητά «μείωση κίνησης», δεν φαίνεται καθόλου (app/layout.tsx και app/intro.css).
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
      <div className="intro-dots" />
      <CityScene mode="once" />
      <div className="intro-brand">
        <span className="intro-logo-wrap">
          <Logo className="h-full w-full" />
        </span>
        <p className="intro-title">Taxi Fleet Tracker</p>
        <p className="intro-tagline">Βάρδιες · ΦΠΑ · Ταμείο</p>
      </div>
    </div>
  );
}
