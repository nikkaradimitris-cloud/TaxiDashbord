'use client';

import { useState, type CSSProperties } from 'react';
import { FuelChoice } from '@/components/FuelChoice';
import type { Totals } from '@/lib/accounting';
import { dataErrorMessage } from '@/lib/errors';
import { formatEuro, formatKm, formatPercent } from '@/lib/format';
import type { DriverRow } from '@/lib/types';
import {
  fuelGroup,
  fuelLabel,
  FUEL_GROUP_LABEL,
  LEVEL_TITLE,
  levelHint,
  levelScale,
  targetsFor,
  utilizationLevel,
  type Fuel,
} from '@/lib/utilization';

/** Ένα αυτοκίνητο της προβολής (όλος ο στόλος ή ένας οδηγός) και τα χιλιόμετρά του στην περίοδο. */
export interface CarKm {
  driver: DriverRow | undefined;
  km: number;
}

/**
 * «Αξιοποίηση χιλιομέτρων»: κυκλικός μετρητής (μισθωμένα / συνολικά χλμ) με χρώμα ανάλογα με το
 * επίπεδο και κλίμακα σύγκρισης· τα όρια εξαρτώνται από το καύσιμο (lib/utilization.ts). Αν ένα
 * αυτοκίνητο δεν έχει δηλωμένο καύσιμο, ο ιδιοκτήτης το διαλέγει εδώ μία φορά.
 */
export function UtilizationCard({
  totals,
  cars,
  isAdmin,
  onSetFuel,
}: {
  totals: Totals;
  cars: CarKm[];
  isAdmin: boolean;
  onSetFuel: (driverId: string, fuel: Fuel) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    tone: 'good' | 'bad';
    text: string;
  } | null>(null);

  // Τα όρια: από τα αυτοκίνητα με χιλιόμετρα στην περίοδο (αλλιώς όλα της προβολής).
  const withKm = cars.filter((car) => car.km > 0);
  const basis = withKm.length > 0 ? withKm : cars;
  const targets = targetsFor(basis.map((car) => ({ fuel: car.driver?.fuel, km: car.km })));
  const level = utilizationLevel(totals.utilizationPct, totals.totalKm, targets);
  const pct = totals.totalKm > 0 ? totals.utilizationPct : 0;

  const fuels = new Set(basis.map((car) => car.driver?.fuel ?? null));
  const groups = new Set(basis.map((car) => fuelGroup(car.driver?.fuel)));
  const oneFuel = fuels.size === 1 ? [...fuels][0] : undefined;
  const fuelText = oneFuel === undefined ? 'διάφορα καύσιμα' : oneFuel ? fuelLabel(oneFuel) : 'καύσιμο: δεν έχει δηλωθεί';
  const limitsText =
    groups.size === 1
      ? `Όρια για ${FUEL_GROUP_LABEL[[...groups][0]]}.`
      : 'Όρια ανάλογα με το καύσιμο και τα χιλιόμετρα κάθε αυτοκινήτου.';

  // Ο ιδιοκτήτης διαλέγει το καύσιμο όσων αυτοκινήτων δεν το έχουν, ένα-ένα.
  const missing = isAdmin ? cars.flatMap((car) => (car.driver && !car.driver.fuel ? [car.driver] : [])) : [];
  const asking = missing[0];

  async function choose(driver: DriverRow, fuel: Fuel) {
    setSaving(true);
    setMessage(null);
    try {
      await onSetFuel(driver.id, fuel);
      setMessage({
        tone: 'good',
        text: `✓ ${carName(driver)}: ${fuelLabel(fuel)}`,
      });
    } catch (error) {
      setMessage({ tone: 'bad', text: dataErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  const zones = [
    { level: 'low', from: 0, len: targets.ok },
    { level: 'ok', from: targets.ok, len: targets.great - targets.ok },
    { level: 'great', from: targets.great, len: 100 - targets.great },
  ];

  return (
    <section className="util-card" data-level={level} aria-labelledby="utilization-title" data-testid="utilization">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 id="utilization-title" className="text-base font-semibold">
          Αξιοποίηση χιλιομέτρων
        </h3>
        <p className="util-muted text-xs">μισθωμένα / συνολικά χλμ · {fuelText}</p>
      </div>

      <div className="util-layout">
        <div className="util-main">
          <div className="util-gauge" role="img" aria-label={`Αξιοποίηση ${formatPercent(pct)}: ${LEVEL_TITLE[level]}`}>
            <svg viewBox="0 0 120 120" aria-hidden="true">
              <circle className="util-track" cx="60" cy="60" r="50" />
              {zones.map((zone) => (
                <circle
                  key={zone.level}
                  className="util-zone"
                  data-level={zone.level}
                  cx="60"
                  cy="60"
                  r="50"
                  pathLength={100}
                  style={{ '--from': zone.from, '--len': zone.len } as CSSProperties}
                />
              ))}
              <circle
                className="util-fill"
                cx="60"
                cy="60"
                r="50"
                pathLength={100}
                style={{ '--pct': Math.min(100, pct).toFixed(1) } as CSSProperties}
              />
            </svg>
            <p aria-hidden="true">
              <strong>{totals.totalKm > 0 ? formatPercent(pct) : '—'}</strong>
              αξιοποίηση
            </p>
          </div>
          <dl className="util-legend util-glass">
            <div>
              <dt>
                <i className="util-key" data-kind="paid" />
                Μισθωμένα
              </dt>
              <dd>{formatKm(totals.paidKm)} χλμ</dd>
            </div>
            <div>
              <dt>
                <i className="util-key" data-kind="empty" />
                Ελεύθερα
              </dt>
              <dd>{formatKm(totals.emptyKm)} χλμ</dd>
            </div>
            <div>
              <dt>Έσοδο ανά χλμ</dt>
              <dd>{formatEuro(Math.round(totals.revenuePerKm * 100))}</dd>
            </div>
          </dl>
        </div>

        <div className="util-side">
          <div aria-live="polite" data-testid="utilization-verdict">
            <p className="util-verdict-title">{LEVEL_TITLE[level]}</p>
            <p className="util-muted mt-0.5 text-sm">{levelHint(level, targets)}</p>
          </div>
          <ol className="util-scale" aria-label="Κλίμακα σύγκρισης">
            {levelScale(targets).map((step) => (
              <li key={step.level} data-level={step.level} aria-current={step.level === level ? 'true' : undefined}>
                <i aria-hidden="true" />
                {step.label}
                <b>{step.range}</b>
              </li>
            ))}
          </ol>
          <p className="util-muted mt-2 text-xs">
            {limitsText}
            {!isAdmin && oneFuel === null && ' Το καύσιμο το δηλώνει ο ιδιοκτήτης.'}
          </p>
        </div>
      </div>

      {asking && (
        <div className="util-glass mt-3 space-y-2 rounded-2xl p-3" data-testid="fuel-prompt">
          <p id="fuel-prompt-title" className="text-sm font-semibold">
            Τι καύσιμο καίει το {carName(asking)};
            {missing.length > 1 && <span className="util-muted font-normal"> (1 από {missing.length})</span>}
          </p>
          <FuelChoice
            dark
            value={null}
            labelledBy="fuel-prompt-title"
            disabled={saving}
            onChange={(fuel) => choose(asking, fuel)}
          />
          <p className="util-muted text-xs">Μία φορά για κάθε αυτοκίνητο· αλλάζει από την «Υποδομή Στόλου».</p>
        </div>
      )}
      {message && (
        <p
          role={message.tone === 'bad' ? 'alert' : 'status'}
          className={message.tone === 'bad' ? 'mt-2 text-sm text-red-300' : 'mt-2 text-sm text-emerald-300'}
        >
          {message.text}
        </p>
      )}
    </section>
  );
}

function carName(driver: DriverRow): string {
  return driver.plate ? `${driver.plate} (${driver.name})` : driver.name;
}
