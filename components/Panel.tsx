'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ComponentProps,
  type ReactNode,
} from 'react';
import { cx } from '@/components/ui';
import { emptyPanelStates, getPanelStates, setPanelOpen, subscribeStorage } from '@/lib/storage';

/** Ποιος χρήστης: κάθε χρήστης της συσκευής έχει τα δικά του ανοιχτά/κλειστά πάνελ. */
const PanelUserContext = createContext('');

export function PanelMemoryProvider({ userId, children }: { userId: string; children: ReactNode }) {
  return <PanelUserContext.Provider value={userId}>{children}</PanelUserContext.Provider>;
}

/**
 * Ανοιχτό ή κλειστό πάνελ· η επιλογή του χρήστη μένει στη συσκευή, αλλιώς ισχύει η προεπιλογή.
 * `userIdOverride`: για χρήση πάνω από τον PanelMemoryProvider (π.χ. στο ίδιο το Dashboard).
 */
export function usePanelOpen(id: string, defaultOpen: boolean, userIdOverride?: string): [boolean, (open: boolean) => void] {
  const contextUserId = useContext(PanelUserContext);
  const userId = userIdOverride ?? contextUserId;
  const states = useSyncExternalStore(subscribeStorage, () => getPanelStates(userId), emptyPanelStates);
  const setOpen = useCallback((open: boolean) => setPanelOpen(userId, id, open), [userId, id]);
  return [states[id] ?? defaultOpen, setOpen];
}

export function Chevron({ open, className }: { open: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className={cx('h-5 w-5 shrink-0 transition-transform', open ? 'rotate-180' : '', className ?? 'text-muted')}
    >
      <path d="M5 7.5 10 12.5 15 7.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** «Κλείσιμο ▴» στη γωνία μιας κάρτας που ανοίγει/κλείνει (π.χ. η φόρμα νέας καταχώρησης). */
export function CollapseButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cx(
        'inline-flex min-h-9 shrink-0 items-center gap-1 rounded-lg px-2 text-sm font-medium text-muted hover:bg-bg hover:text-fg',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong',
      )}
    >
      Κλείσιμο
      <Chevron open className="text-current" />
    </button>
  );
}

/**
 * Ενότητα που ανοίγει/κλείνει με πάτημα στον τίτλο. Κλειστή δείχνει μόνο τον
 * τίτλο και μια σύνοψη μιας γραμμής· το περιεχόμενο μένει φορτωμένο (κρυφό),
 * ώστε ό,τι γράφτηκε να μη χάνεται όταν κλείνει.
 */
export function Panel({
  id,
  title,
  summary,
  badge,
  defaultOpen = false,
  headingLevel = 2,
  className,
  children,
  ...rest
}: {
  /** Κλειδί της μνήμης και id της ενότητας στη σελίδα. */
  id: string;
  title: ReactNode;
  /** Μία γραμμή κάτω από τον τίτλο όσο το πάνελ είναι κλειστό. */
  summary?: ReactNode;
  /** Σήμανση δίπλα στο βελάκι (φαίνεται πάντα), π.χ. «λείπουν 3». */
  badge?: ReactNode;
  defaultOpen?: boolean;
  headingLevel?: 2 | 3;
  className?: string;
  children: ReactNode;
} & Omit<ComponentProps<'section'>, 'id' | 'title' | 'children' | 'className'>) {
  const [open, setOpen] = usePanelOpen(id, defaultOpen);
  // Σύνδεσμος προς την ενότητα (π.χ. «#fleet»): ανοίγει μόνη της.
  useEffect(() => {
    const openIfTarget = () => {
      if (window.location.hash === `#${id}`) setOpen(true);
    };
    openIfTarget();
    window.addEventListener('hashchange', openIfTarget);
    return () => window.removeEventListener('hashchange', openIfTarget);
  }, [id, setOpen]);
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const bodyId = `${id}-body`;
  return (
    <section id={id} className={cx('rounded-2xl border border-line bg-card shadow-sm', className)} {...rest}>
      <Heading className={headingLevel === 2 ? 'text-lg font-semibold' : 'text-base font-semibold'}>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen(!open)}
          className={cx(
            'flex min-h-11 w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left sm:px-5',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong',
          )}
        >
          <span className="min-w-0">
            <span className="block">{title}</span>
            {!open && summary && <span className="mt-0.5 block text-sm font-normal text-muted">{summary}</span>}
          </span>
          <span className="flex shrink-0 items-center gap-2">
            {badge}
            <Chevron open={open} />
          </span>
        </button>
      </Heading>
      <div id={bodyId} hidden={!open}>
        <div className="px-4 pb-4 sm:px-5 sm:pb-5">{children}</div>
      </div>
    </section>
  );
}
