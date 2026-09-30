'use client';

import { cx } from '@/components/ui';
import { FUELS, type Fuel } from '@/lib/utilization';

/**
 * Καύσιμο του αυτοκινήτου με πέντε κουμπιά· το επιλεγμένο με το κίτρινο των κουμπιών.
 * `dark`: μέσα στη σκούρα κάρτα «Αξιοποίηση χιλιομέτρων».
 */
export function FuelChoice({
  value,
  onChange,
  disabled,
  dark = false,
  labelledBy,
}: {
  value: Fuel | null;
  onChange: (fuel: Fuel) => void;
  disabled?: boolean;
  dark?: boolean;
  /** id του τίτλου της ομάδας (για τους αναγνώστες οθόνης). */
  labelledBy: string;
}) {
  return (
    <div role="group" aria-labelledby={labelledBy} className="flex flex-wrap gap-2">
      {FUELS.map((fuel) => {
        const selected = value === fuel.id;
        return (
          <button
            key={fuel.id}
            type="button"
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => onChange(fuel.id)}
            className={cx(
              'min-h-11 rounded-xl border-2 px-2.5 text-sm font-semibold transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong',
              'disabled:cursor-not-allowed disabled:opacity-60',
              selected
                ? 'border-accent bg-accent text-on-accent shadow-sm'
                : dark
                  ? 'border-white/25 bg-white/5 text-white hover:border-accent'
                  : 'border-line bg-card hover:border-accent-strong',
            )}
          >
            {fuel.label}
          </button>
        );
      })}
    </div>
  );
}
