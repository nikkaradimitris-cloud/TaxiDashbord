import type { ComponentProps, ReactNode } from 'react';

function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

export function Card({
  title,
  actions,
  children,
  className,
  id,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cx('rounded-2xl border border-line bg-card p-4 shadow-sm sm:p-5', className)}>
      {(title || actions) && (
        <header className="mb-4 flex items-center justify-between gap-2">
          {title && <h2 className="min-w-0 text-lg font-semibold">{title}</h2>}
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'whatsapp';

const buttonStyles: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-strong font-semibold',
  secondary: 'border border-line bg-card text-fg hover:bg-bg',
  danger: 'border border-bad/40 text-bad hover:bg-bad-soft',
  ghost: 'text-muted hover:bg-bg hover:text-fg',
  whatsapp: 'bg-[#25D366] text-[#0b3d20] hover:bg-[#1fbd5a] font-semibold',
};

export function Button({
  variant = 'secondary',
  className,
  ...props
}: ComponentProps<'button'> & { variant?: ButtonVariant }) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong',
        'disabled:cursor-not-allowed disabled:opacity-50',
        buttonStyles[variant],
        className,
      )}
    />
  );
}

const controlClass =
  'block w-full min-h-11 rounded-xl border border-line bg-field px-3 py-2 text-base text-fg ' +
  'placeholder:text-muted/70 focus:border-accent-strong focus:outline-none focus:ring-2 focus:ring-accent/40 ' +
  'disabled:opacity-70 aria-[invalid=true]:border-bad';

export function Field({
  label,
  hint,
  error,
  children,
  className,
  subgrid,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
  /**
   * Μέσα σε `FieldRow`: ετικέτα, πεδίο και μήνυμα μοιράζονται τις γραμμές με το
   * διπλανό πεδίο, ώστε τα κουτιά να μένουν στην ίδια ευθεία κι όταν μια ετικέτα
   * πιάνει δύο γραμμές (στενό κινητό, «Α+»).
   */
  subgrid?: boolean;
}) {
  return (
    <label className={cx(subgrid ? 'row-span-3 grid grid-rows-subgrid' : 'block', className)}>
      <span className="mb-1 block text-sm font-medium [overflow-wrap:anywhere]">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-sm text-bad">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-muted">{hint}</span>
      ) : null}
    </label>
  );
}

/** Δύο πεδία δίπλα-δίπλα (με `subgrid`), με τα κουτιά τους στην ίδια ευθεία. */
export function FieldRow({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 grid-rows-[auto_auto_auto] gap-x-3">{children}</div>;
}

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input {...props} className={cx(controlClass, className)} />;
}

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select {...props} className={cx(controlClass, 'pr-2', className)} />;
}

type NoticeTone = 'error' | 'success' | 'info' | 'warning';

const noticeStyles: Record<NoticeTone, string> = {
  error: 'border-bad/30 bg-bad-soft text-bad',
  success: 'border-good/30 bg-good-soft text-good',
  info: 'border-line bg-info-soft text-fg',
  warning: 'border-warn/30 bg-warn-soft text-warn',
};

export function Notice({ tone = 'info', children, className }: { tone?: NoticeTone; children: ReactNode; className?: string }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cx('rounded-xl border px-3 py-2 text-sm', noticeStyles[tone], className)}
    >
      {children}
    </div>
  );
}

/** Σήμανση (δεν πατιέται, γι' αυτό ποτέ κίτρινη). */
export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'bad' | 'warn' }) {
  const styles = {
    neutral: 'bg-bg text-muted border-line',
    good: 'bg-good-soft text-good border-good/30',
    bad: 'bg-bad-soft text-bad border-bad/30',
    warn: 'bg-warn-soft text-warn border-warn/30',
  }[tone];
  return <span className={cx('inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium', styles)}>{children}</span>;
}

/** Ομάδα επιλογών (π.χ. «Uber | FreeNow»): η επιλεγμένη με το ίδιο κίτρινο που έχουν τα κύρια κουμπιά. */
export const choiceStyles = {
  on: 'bg-accent font-semibold text-on-accent shadow-sm',
  off: 'text-muted hover:bg-card hover:text-fg',
} as const;

export { cx };
