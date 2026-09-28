'use client';

import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { Chevron, Panel, usePanelOpen } from '@/components/Panel';
import { Badge, cx, Notice } from '@/components/ui';
import { summarize, vatStatus, type ExpenseFigures, type ShiftFigures, type Totals } from '@/lib/accounting';
import { formatEuro, formatEuroPerKm, formatInteger, formatKm, formatPercent } from '@/lib/format';
import { periodLabel, type MonthFilter } from '@/lib/period';
import { platformLabel, totalsByPlatform, type PlatformMonth } from '@/lib/platforms';
import type { DriverRow, ExpenseRow, ShiftRow } from '@/lib/types';
import { buildVatMessage, whatsappLink } from '@/lib/whatsapp';

const STATUS_TEXT = {
  debit: 'Χρεωστικό — προς πληρωμή',
  credit: 'Πιστωτικό υπόλοιπο',
  zero: 'Μηδενικό υπόλοιπο',
} as const;

export function StatsPanel({
  totals,
  loading,
  isAdmin,
  year,
  month,
  selectedDriver,
  items,
  expenseItems,
  platformMonths,
  driversById,
  showPerDriver,
  onSelectDriver,
  analysis,
}: {
  totals: Totals;
  loading: boolean;
  isAdmin: boolean;
  year: number;
  month: MonthFilter;
  selectedDriver: DriverRow | null;
  items: { row: ShiftRow; figures: ShiftFigures }[];
  /** Έξοδα οχήματος της περιόδου (εκτός βάρδιας). */
  expenseItems: { row: ExpenseRow; figures: ExpenseFigures }[];
  /** Εφαρμογές ανά αυτοκίνητο, μήνα και εφαρμογή (κράτηση: τιμολόγιο ή εβδομάδες). */
  platformMonths: PlatformMonth[];
  driversById: Map<string, DriverRow>;
  showPerDriver: boolean;
  onSelectDriver: (driverId: string) => void;
  /** Η κάρτα «Αναλυτικά» (πίνακας/γράφημα), κάτω από τις κάρτες απόδοσης. */
  analysis: ReactNode;
}) {
  const status = vatStatus(totals.vatBalanceCents);
  // Κρατήσεις χωρίς ΦΠΑ (ενδοκοινοτικά τιμολόγια, π.χ. Uber): στα έξοδα, αλλά όχι στον συμψηφισμό.
  const noVatPlatforms = totalsByPlatform(platformMonths).filter((platform) => platform.commissionNoVatCents > 0);
  const noVatCents = noVatPlatforms.reduce((sum, platform) => sum + platform.commissionNoVatCents, 0);
  const expenseParts = [
    `Καύσιμα ${formatEuro(totals.fuelCents)}`,
    `Έξοδα οχήματος ${formatEuro(totals.vehicleExpensesCents)}`,
    totals.appCommissionCents > 0 ? `Κρατήσεις εφαρμογών ${formatEuro(totals.appCommissionCents)}` : null,
  ];
  const [vatOpen, setVatOpen] = usePanelOpen('vat-details', false);

  return (
    <section aria-busy={loading} className={cx('min-w-0 space-y-4 transition-opacity', loading && 'opacity-50')}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Στατιστικά · {periodLabel(year, month)}</h2>
        <span className="text-sm text-muted">
          {loading ? 'Φόρτωση…' : selectedDriver ? selectedDriver.name : isAdmin ? 'Όλος ο στόλος' : ''}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        <Stat label="Μικτή Είσπραξη (Τζίρος)" value={formatEuro(totals.grossReceiptsCents)} />
        <Stat
          label="Συνολικά Έξοδα"
          value={formatEuro(totals.totalExpensesCents)}
          sub={expenseParts.filter(Boolean).join(' · ')}
        />
        <Stat
          label="Καθαρό Ταμείο (Τσέπη)"
          value={formatEuro(totals.netCashCents)}
          emphasis
          className="col-span-2 xl:col-span-1"
        />
      </div>

      <div
        className={cx(
          'rounded-2xl border p-4 shadow-sm',
          status === 'debit' && 'border-bad/40 bg-bad-soft',
          status === 'credit' && 'border-good/40 bg-good-soft',
          status === 'zero' && 'border-line bg-card',
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Προς Απόδοση ΦΠΑ</p>
            <p
              className={cx(
                'text-3xl font-bold tabular-nums',
                status === 'debit' && 'text-bad',
                status === 'credit' && 'text-good',
              )}
            >
              {formatEuro(Math.abs(totals.vatBalanceCents))}
            </p>
            <p className="text-sm font-semibold">{STATUS_TEXT[status]}</p>
          </div>
          {isAdmin && (
            <WhatsAppShare driver={selectedDriver} year={year} month={month} totals={totals} loading={loading} />
          )}
        </div>
        <button
          type="button"
          aria-expanded={vatOpen}
          aria-controls="vat-details"
          onClick={() => setVatOpen(!vatOpen)}
          className={cx(
            'mt-2 inline-flex min-h-9 items-center gap-1 rounded-lg text-sm font-semibold',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong',
          )}
        >
          Ανάλυση ΦΠΑ
          <Chevron open={vatOpen} className="text-current" />
        </button>
        <div id="vat-details" hidden={!vatOpen}>
          <dl className="mt-1 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm tabular-nums">
            <dt>ΦΠΑ εσόδων 13%</dt>
            <dd className="text-right">+ {formatEuro(totals.vatCents)}</dd>
            <dt>ΦΠΑ εξόδων 24% (εμπεριεχόμενος)</dt>
            <dd className="text-right">− {formatEuro(totals.expensesVatCents)}</dd>
          </dl>
          {noVatCents > 0 && (
            <p className="mt-2 text-xs">
              Οι κρατήσεις {noVatPlatforms.map((platform) => platformLabel(platform.platform)).join(', ')} (
              {formatEuro(noVatCents)}) δεν έχουν ΦΠΑ και δεν συμψηφίζονται.
            </p>
          )}
        </div>
      </div>

      <Panel
        id="stats-details"
        headingLevel={3}
        title="Έσοδα, χιλιόμετρα & διαδρομές"
        summary={`καθαρά ${formatEuro(totals.netRevenueCents)} · ${formatKm(totals.totalKm)} χλμ · ${formatInteger(totals.trips)} διαδρομές`}
      >
        <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 text-sm tabular-nums">
          <Detail label="Καθαρά έσοδα" value={formatEuro(totals.netRevenueCents)} />
          <Detail label="ΦΠΑ εσόδων 13%" value={formatEuro(totals.vatCents)} />
          <Detail label="Φιλοδωρήματα / άλλα" sub="χωρίς ΦΠΑ" value={formatEuro(totals.tipsCents)} />
          <Detail
            label="Συνολικά χλμ"
            sub={`μισθωμένα ${formatKm(totals.paidKm)} · ελεύθερα ${formatKm(totals.emptyKm)}`}
            value={formatKm(totals.totalKm)}
          />
          <Detail label="Αξιοποίηση" sub="μισθωμένα / συνολικά χλμ" value={formatPercent(totals.utilizationPct)} />
          <Detail label="Έσοδο ανά χλμ" sub="καθαρά / συνολικά χλμ" value={formatEuroPerKm(totals.revenuePerKm)} />
          <Detail
            label="Διαδρομές"
            sub={`${totals.shifts} βάρδιες${platformMonths.length > 0 ? ` · δρόμος ${formatInteger(totals.streetTrips)}` : ''}`}
            value={formatInteger(totals.trips)}
          />
        </dl>
      </Panel>

      {platformMonths.length > 0 && <StreetAndApps totals={totals} platformMonths={platformMonths} />}

      {analysis}

      {showPerDriver && (
        <PerDriver
          items={items}
          expenseItems={expenseItems}
          platformMonths={platformMonths}
          driversById={driversById}
          onSelectDriver={onSelectDriver}
        />
      )}
    </section>
  );
}

/**
 * Δρόμος & Εφαρμογές: οι κούρσες των εφαρμογών είναι μέσα στα Ζ, οι υπόλοιπες
 * είναι από τον δρόμο. Κράτηση ανά εφαρμογή (τιμολόγιο ή, προσωρινά, εβδομάδες).
 */
function StreetAndApps({ totals, platformMonths }: { totals: Totals; platformMonths: PlatformMonth[] }) {
  const platforms = totalsByPlatform(platformMonths);
  const share = (trips: number) => (totals.trips > 0 ? formatPercent((trips / totals.trips) * 100) : '—');
  const source = (invoiced: number, months: number) =>
    invoiced === months ? 'τιμολόγιο' : invoiced === 0 ? 'προσωρινή' : `τιμολόγια ${invoiced}/${months}`;

  return (
    <Panel
      id="street-apps"
      headingLevel={3}
      title="Δρόμος & Εφαρμογές"
      summary={`δρόμος ${formatInteger(totals.streetTrips)} από ${formatInteger(totals.trips)} διαδρομές · κρατήσεις ${formatEuro(totals.appCommissionCents)}`}
      badge={totals.streetTrips < 0 ? <Badge tone="warn">έλεγχος</Badge> : null}
    >
      <p className="text-xs text-muted">Οι κούρσες των εφαρμογών είναι μέσα στα Ζ· οι υπόλοιπες είναι από τον δρόμο.</p>
      <div className="-mx-4 mt-3 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
        <table className="w-full min-w-[19rem] text-sm tabular-nums">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="py-1 pr-2 font-medium">
                <span className="sr-only">Πηγή</span>
              </th>
              <th className="py-1 pr-2 text-right font-medium">Διαδρομές</th>
              <th className="py-1 pr-2 text-right font-medium">Τζίρος</th>
              <th className="py-1 text-right font-medium">Κράτηση</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-line">
              <th scope="row" className="py-2 pr-2 text-left font-medium">
                Δρόμος
              </th>
              <td className="py-2 pr-2 text-right">
                {formatInteger(totals.streetTrips)}
                <span className="block text-xs text-muted">{share(totals.streetTrips)}</span>
              </td>
              <td className="py-2 pr-2 text-right">{formatEuro(totals.grossReceiptsCents - totals.appTurnoverCents)}</td>
              <td className="py-2 text-right text-muted">—</td>
            </tr>
            {platforms.map((platform) => (
              <tr key={platform.platform} className="border-t border-line">
                <th scope="row" className="py-2 pr-2 text-left font-medium">
                  {platformLabel(platform.platform)}
                </th>
                <td className="py-2 pr-2 text-right">
                  {formatInteger(platform.trips)}
                  <span className="block text-xs text-muted">{share(platform.trips)}</span>
                </td>
                <td className="py-2 pr-2 text-right">{formatEuro(platform.turnoverCents)}</td>
                <td className="py-2 text-right">
                  {formatEuro(platform.commissionCents)}
                  <span className="block text-xs text-muted">{source(platform.invoiced, platform.months)}</span>
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-line font-semibold">
              <th scope="row" className="py-2 pr-2 text-left whitespace-nowrap">
                Σύνολο Ζ
              </th>
              <td className="py-2 pr-2 text-right">{formatInteger(totals.trips)}</td>
              <td className="py-2 pr-2 text-right">{formatEuro(totals.grossReceiptsCents)}</td>
              <td className="py-2 text-right">{formatEuro(totals.appCommissionCents)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {totals.streetTrips < 0 && (
        <Notice tone="warning" className="mt-3">
          Οι διαδρομές των εφαρμογών ({formatInteger(totals.appTrips)}) είναι περισσότερες από τις διαδρομές των Ζ (
          {formatInteger(totals.trips)}). Λείπει κάποια βάρδια ή υπάρχει λάθος σε κάποια εβδομάδα;
        </Notice>
      )}
      <p className="mt-2 text-xs text-muted">
        Τζίρος δρόμου = μικτή είσπραξη των Ζ − έσοδα εφαρμογών. «Προσωρινή» κράτηση: από τις εβδομάδες, μέχρι να
        καταχωρηθεί το τιμολόγιο του μήνα.
      </p>
    </Panel>
  );
}

/** Μία γραμμή στις «λεπτομέρειες»: τίτλος (με εξήγηση) και τιμή. */
function Detail({ label, sub, value }: { label: string; sub?: string; value: string }) {
  return (
    <>
      <dt>
        {label}
        {sub && <span className="block text-xs text-muted">{sub}</span>}
      </dt>
      <dd className="text-right font-semibold">{value}</dd>
    </>
  );
}

function Stat({
  label,
  value,
  sub,
  emphasis,
  className,
}: {
  label: string;
  value: string;
  sub?: string;
  emphasis?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cx(
        '@container rounded-2xl border p-3 shadow-sm',
        emphasis ? 'border-accent-strong bg-accent text-on-accent' : 'border-line bg-card',
        className,
      )}
    >
      <p className={cx('text-xs font-medium', emphasis ? 'text-on-accent/80' : 'text-muted')}>{label}</p>
      {/* Το ποσό μικραίνει μόνο αν δεν χωράει στην κάρτα (μικρό κινητό, «Α+»). */}
      <p
        className="fit-number mt-1 leading-tight font-bold tabular-nums [--fit-max:var(--text-xl)] sm:[--fit-max:var(--text-2xl)]"
        style={{ '--chars': value.length } as CSSProperties}
      >
        {value}
      </p>
      {sub && <p className={cx('mt-1 text-xs', emphasis ? 'text-on-accent/80' : 'text-muted')}>{sub}</p>}
    </div>
  );
}

function WhatsAppShare({
  driver,
  year,
  month,
  totals,
  loading,
}: {
  driver: DriverRow | null;
  year: number;
  month: MonthFilter;
  totals: Totals;
  loading: boolean;
}) {
  // Όσο φορτώνουν τα δεδομένα του νέου φίλτρου τα σύνολα είναι του προηγούμενου: όχι αποστολή.
  const link =
    driver && !loading
      ? whatsappLink(driver.phone, buildVatMessage({ driverName: driver.name, plate: driver.plate, year, month, totals }))
      : null;
  const hint = !driver
    ? 'Επιλέξτε οδηγό στο φίλτρο για αποστολή.'
    : loading
      ? 'Φόρτωση δεδομένων…'
      : !link
        ? 'Ο οδηγός δεν έχει έγκυρο κινητό (69XXXXXXXX).'
        : `Προς ${driver.name}`;

  return (
    <div className="flex flex-col items-end gap-1">
      {link ? (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#25D366] px-4 py-2 text-sm font-semibold text-[#0b3d20] hover:bg-[#1fbd5a]"
        >
          <WhatsAppIcon />
          Αποστολή WhatsApp
        </a>
      ) : (
        <span
          aria-disabled="true"
          className="inline-flex min-h-11 cursor-not-allowed items-center gap-2 rounded-xl bg-[#25D366]/40 px-4 py-2 text-sm font-semibold text-[#0b3d20]/70"
        >
          <WhatsAppIcon />
          Αποστολή WhatsApp
        </span>
      )}
      <span className="max-w-56 text-right text-xs text-muted">{hint}</span>
    </div>
  );
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3z" />
    </svg>
  );
}

/** Σύνοψη ανά οδηγό (admin, όταν βλέπει όλο τον στόλο). */
function PerDriver({
  items,
  expenseItems,
  platformMonths,
  driversById,
  onSelectDriver,
}: {
  items: { row: ShiftRow; figures: ShiftFigures }[];
  expenseItems: { row: ExpenseRow; figures: ExpenseFigures }[];
  platformMonths: PlatformMonth[];
  driversById: Map<string, DriverRow>;
  onSelectDriver: (driverId: string) => void;
}) {
  const rows = useMemo(() => {
    // Κάθε οδηγός/αυτοκίνητο: οι βάρδιές του, τα έξοδα οχήματος και οι εφαρμογές του αυτοκινήτου του.
    const groups = new Map<string, { shifts: ShiftFigures[]; expenses: ExpenseFigures[]; platforms: PlatformMonth[] }>();
    const group = (driverId: string) => {
      let entry = groups.get(driverId);
      if (!entry) {
        entry = { shifts: [], expenses: [], platforms: [] };
        groups.set(driverId, entry);
      }
      return entry;
    };
    for (const { row, figures } of items) group(row.driver_id).shifts.push(figures);
    for (const { row, figures } of expenseItems) group(row.driver_id).expenses.push(figures);
    for (const platform of platformMonths) group(platform.driverId).platforms.push(platform);
    return [...groups.entries()]
      .map(([driverId, list]) => ({ driverId, totals: summarize(list.shifts, list.expenses, list.platforms) }))
      .sort((a, b) => b.totals.netRevenueCents - a.totals.netRevenueCents);
  }, [items, expenseItems, platformMonths]);

  if (rows.length === 0) return null;

  return (
    <Panel
      id="per-driver"
      headingLevel={3}
      title="Ανά οδηγό"
      summary={`${rows.length === 1 ? '1 οδηγός' : `${rows.length} οδηγοί`} · καθαρά, ΦΠΑ, ταμείο`}
    >
      <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
        <table className="w-full min-w-[34rem] text-sm tabular-nums">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="py-1 pr-2 font-medium">Οδηγός</th>
              <th className="py-1 pr-2 text-right font-medium">Βάρδιες</th>
              <th className="py-1 pr-2 text-right font-medium">Καθαρά</th>
              <th className="py-1 pr-2 text-right font-medium">Υπόλοιπο ΦΠΑ</th>
              <th className="py-1 text-right font-medium">Καθαρό Ταμείο</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ driverId, totals }) => {
              const driver = driversById.get(driverId);
              const status = vatStatus(totals.vatBalanceCents);
              return (
                <tr key={driverId} className="border-t border-line">
                  <td className="py-2 pr-2">
                    <button type="button" className="text-left font-medium underline" onClick={() => onSelectDriver(driverId)}>
                      {driver?.name ?? '—'}
                    </button>
                    {driver?.plate && <span className="block text-xs text-muted">{driver.plate}</span>}
                  </td>
                  <td className="py-2 pr-2 text-right">{totals.shifts}</td>
                  <td className="py-2 pr-2 text-right">{formatEuro(totals.netRevenueCents)}</td>
                  <td className={cx('py-2 pr-2 text-right', status === 'debit' && 'text-bad', status === 'credit' && 'text-good')}>
                    {formatEuro(Math.abs(totals.vatBalanceCents))} {status === 'debit' ? 'Χ' : status === 'credit' ? 'Π' : ''}
                  </td>
                  <td className="py-2 text-right font-semibold">{formatEuro(totals.netCashCents)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">Χ = Χρεωστικό, Π = Πιστωτικό. Πατήστε ένα όνομα για φιλτράρισμα.</p>
    </Panel>
  );
}
