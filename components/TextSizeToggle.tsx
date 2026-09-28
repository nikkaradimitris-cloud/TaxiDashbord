'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { cx } from '@/components/ui';
import { applyTextSize, getTextSize, setTextSize, subscribeStorage, type TextSize } from '@/lib/storage';

const NORMAL: TextSize = 'normal';

/** Κουμπί «Α+»: ακόμη μεγαλύτερα γράμματα σε όλη την εφαρμογή· η συσκευή το θυμάται. */
export function TextSizeToggle({ className }: { className?: string }) {
  const large = useSyncExternalStore(subscribeStorage, getTextSize, () => NORMAL) === 'large';

  // Συγχρονισμός του <html> με την αποθηκευμένη ρύθμιση (π.χ. αλλαγή από άλλη καρτέλα).
  useEffect(() => applyTextSize(getTextSize()), [large]);

  return (
    <button
      type="button"
      aria-pressed={large}
      aria-label="Μεγαλύτερα γράμματα"
      title={large ? 'Επιστροφή σε κανονικά γράμματα' : 'Μεγαλύτερα γράμματα'}
      onClick={() => setTextSize(large ? 'normal' : 'large')}
      className={cx(
        'inline-flex h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border px-2 text-lg font-bold leading-none',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong',
        large ? 'border-accent-strong bg-accent text-on-accent' : 'border-line bg-card text-fg hover:bg-bg',
        className,
      )}
    >
      Α<span aria-hidden="true">+</span>
    </button>
  );
}
