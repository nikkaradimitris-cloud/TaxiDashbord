'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Παράθυρο πάνω από τη σελίδα για τη διόρθωση βάρδιας, ώστε ο χρήστης να
 * μένει εκεί που ήταν στο ιστορικό. Κλείνει με «Ακύρωση» ή Esc.
 */
export function EditShiftDialog({
  onClose,
  children,
  label = 'Επεξεργασία βάρδιας',
}: {
  onClose: () => void;
  children: ReactNode;
  label?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 px-3 py-4 backdrop-blur-sm sm:p-8">
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="mx-auto w-full max-w-xl outline-none"
      >
        {children}
      </div>
    </div>
  );
}
