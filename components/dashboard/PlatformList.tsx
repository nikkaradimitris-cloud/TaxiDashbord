'use client';

import { Panel } from '@/components/Panel';
import { Badge, Button, cx } from '@/components/ui';
import { toCents } from '@/lib/accounting';
import { formatEuro, formatInteger, formatSignedEuro } from '@/lib/format';
import { monthName, type MonthFilter } from '@/lib/period';
import {
  findRate,
  formatWeek,
  PLATFORMS,
  platformLabel,
  rateLabel,
  statementRevenueCents,
  toVatRate,
  weekCycles,
  weekState,
  type PlatformId,
  type PlatformMonth,
} from '@/lib/platforms';
import type { DriverRow, PlatformRateRow, StatementRow } from '@/lib/types';

const DAY_MS = 24 * 60 * 60 * 1000;

const PLATFORM_ORDER = new Map<string, number>(PLATFORMS.map((platform, index) => [platform.id, index]));

/** Μήνας ↓, εφαρμογή, εβδομάδες με τη σειρά και στο τέλος το τιμολόγιο. */
function compareStatements(a: StatementRow, b: StatementRow) {
  return (
    b.year - a.year ||
    b.month - a.month ||
    a.driver_id.localeCompare(b.driver_id) ||
    (PLATFORM_ORDER.get(a.platform) ?? 9) - (PLATFORM_ORDER.get(b.platform) ?? 9) ||
    Number(a.kind === 'invoice') - Number(b.kind === 'invoice') ||
    (a.week_start ?? '').localeCompare(b.week_start ?? '') ||
    a.created_at.localeCompare(b.created_at)
  );
}

function entryTitle(row: StatementRow) {
  if (row.kind === 'invoice') return `Τιμολόγιο${row.reference ? ` ${row.reference}` : ''}`;
  return `Εβδομάδα ${row.week_start && row.week_end ? formatWeek(row.week_start, row.week_end) : ''}`;
}

function vatText(row: StatementRow): string {
  return toVatRate(row.vat_rate) === 24 ? formatEuro(toCents(Number(row.commission_vat ?? 0))) : 'χωρίς ΦΠΑ';
}

/**
 * Οι καταχωρήσεις εφαρμογών της περιόδου. Για ένα αυτοκίνητο και έναν μήνα
 * δείχνει ανά εφαρμογή το ποσοστό, ποιες εβδομάδες έχουν μπει, ποιες λείπουν
 * και αν υπάρχει το τιμολόγιο του μήνα.
 */
export function PlatformList({
  statements,
  months,
  rates,
  loading,
  driversById,
  isAdmin,
  userId,
  fetchedAt,
  today,
  year,
  month,
  carId,
  periodText,
  editingId,
  onEdit,
  onDelete,
  onAddWeek,
}: {
  statements: StatementRow[];
  /** Ανά αυτοκίνητο, μήνα και εφαρμογή (κράτηση: τιμολόγιο ή εβδομάδες). */
  months: PlatformMonth[];
  rates: readonly PlatformRateRow[];
  loading: boolean;
  driversById: Map<string, DriverRow>;
  isAdmin: boolean;
  userId: string;
  fetchedAt: number;
  today: string;
  year: number;
  month: MonthFilter;
  /** Το αυτοκίνητο της προβολής (φίλτρο ή ο οδηγός), ή null για όλο τον στόλο. */
  carId: string | null;
  periodText: string;
  editingId: string | null;
  onEdit: (row: StatementRow) => void;
  onDelete: (row: StatementRow) => void;
  /** Πάτημα σε εβδομάδα που λείπει ή τρέχει: ανοίγει η φόρμα σε αυτή την εφαρμογή και εβδομάδα. */
  onAddWeek: (platform: PlatformId, weekStart: string) => void;
}) {
  // Ο οδηγός διορθώνει/διαγράφει δικές του καταχωρήσεις μόνο μέσα σε 24 ώρες (ο κανόνας ισχύει και στη βάση).
  const canModify = (row: StatementRow) =>
    isAdmin || (row.created_by === userId && Date.parse(row.created_at) > fetchedAt - DAY_MS);
  const sorted = [...statements].sort(compareStatements);
  const totals = months.reduce(
    (sum, group) => ({
      trips: sum.trips + group.trips,
      turnoverCents: sum.turnoverCents + group.turnoverCents,
      tipsCents: sum.tipsCents + group.tipsCents,
      commissionCents: sum.commissionCents + group.commissionCents,
      commissionVatCents: sum.commissionVatCents + group.commissionVatCents,
      commissionNoVatCents: sum.commissionNoVatCents + group.commissionNoVatCents,
    }),
    { trips: 0, turnoverCents: 0, tipsCents: 0, commissionCents: 0, commissionVatCents: 0, commissionNoVatCents: 0 },
  );
  const checklist = month !== 'all' && carId !== null;
  // Μόνο οι εφαρμογές που χρησιμοποιεί το αυτοκίνητο: με ποσοστό ή με καταχωρήσεις στον μήνα.
  const usedPlatforms = checklist
    ? PLATFORMS.filter(
        ({ id }) =>
          findRate(rates, carId, id) !== null ||
          statements.some((row) => row.driver_id === carId && row.month === month && row.platform === id),
      )
    : [];

  const vehicle = (row: StatementRow) => {
    const driver = driversById.get(row.driver_id);
    return { plate: driver?.plate ?? null, name: driver?.name ?? '—' };
  };
  // Εβδομάδες που τελείωσαν χωρίς καταχώρηση (για ένα αυτοκίνητο και έναν μήνα): φαίνονται και με κλειστό πάνελ.
  const missingWeeks =
    checklist
      ? usedPlatforms.reduce((sum, { id }) => {
          const entered = new Set(
            statements.flatMap((row) =>
              row.driver_id === carId && row.month === month && row.platform === id && row.kind === 'week' && row.week_start
                ? [row.week_start]
                : [],
            ),
          );
          return sum + weekCycles(year, month).filter((week) => weekState(week, entered, today) === 'missing').length;
        }, 0)
      : 0;
  const count = statements.length === 1 ? '1 καταχώρηση' : `${statements.length} καταχωρήσεις`;

  return (
    <Panel
      id="platforms"
      title={`Εφαρμογές · ${periodText}`}
      summary={
        loading
          ? 'Φόρτωση…'
          : statements.length === 0
            ? 'Καμία καταχώρηση'
            : `${count} · κρατήσεις ${formatEuro(totals.commissionCents)}`
      }
      badge={
        missingWeeks > 0 && !loading ? (
          <Badge tone="warn">{missingWeeks === 1 ? 'λείπει 1 εβδ.' : `λείπουν ${missingWeeks} εβδ.`}</Badge>
        ) : null
      }
      className={cx(loading && 'opacity-60')}
    >
      {checklist ? (
        usedPlatforms.length > 0 ? (
          <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {usedPlatforms.map(({ id }) => (
              <PlatformMonthCard
                key={id}
                platform={id}
                year={year}
                month={month}
                today={today}
                rateText={(() => {
                  const rate = findRate(rates, carId, id);
                  return rate ? rateLabel(rate) : null;
                })()}
                rows={statements.filter((row) => row.driver_id === carId && row.month === month && row.platform === id)}
                group={months.find((group) => group.driverId === carId && group.month === month && group.platform === id) ?? null}
                onAddWeek={(weekStart) => onAddWeek(id, weekStart)}
              />
            ))}
          </div>
        ) : (
          <p className="mb-3 text-sm text-muted">
            Για να ξεκινήσετε, πατήστε «Εφαρμογή» στη φόρμα και ορίστε το ποσοστό της Uber, της FreeNow ή της Bolt.
          </p>
        )
      ) : (
        <p className="mb-3 text-sm text-muted">
          {month === 'all'
            ? 'Επιλέξτε μήνα για να δείτε ποιες εβδομάδες λείπουν.'
            : 'Επιλέξτε οδηγό στο φίλτρο για να δείτε ποιες εβδομάδες λείπουν.'}
        </p>
      )}

      {sorted.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted">
          {loading ? 'Φόρτωση…' : 'Δεν υπάρχουν καταχωρήσεις εφαρμογών για αυτή την περίοδο.'}
        </p>
      ) : (
        <>
          {/* Κινητό: κάρτες */}
          <ul className="space-y-3 md:hidden">
            {sorted.map((row) => {
              const { plate, name } = vehicle(row);
              const tipsCents = toCents(Number(row.tips));
              return (
                <li
                  key={row.id}
                  className={cx('rounded-xl border p-3', row.id === editingId ? 'border-accent-strong bg-warn-soft' : 'border-line')}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold">{platformLabel(row.platform)}</p>
                      <p className="text-sm font-medium">{entryTitle(row)}</p>
                      {row.kind === 'week' && (
                        <p className="text-sm">
                          <span className="whitespace-nowrap">{formatInteger(row.trips)} διαδρομές</span> ·{' '}
                          <span className="whitespace-nowrap">έσοδα {formatEuro(statementRevenueCents(row))}</span>
                          {tipsCents > 0 && (
                            <>
                              {' · '}
                              <span className="whitespace-nowrap">φιλοδ./quest {formatEuro(tipsCents)}</span>
                            </>
                          )}
                        </p>
                      )}
                      <p className="text-xs text-muted">
                        {monthName(row.month)} {row.year} · {plate ? `${plate} · ` : ''}
                        {name}
                      </p>
                    </div>
                    <p className="shrink-0 text-right font-bold tabular-nums">
                      {formatEuro(toCents(Number(row.commission)))}
                      <span className="block text-xs font-normal text-muted">
                        {toVatRate(row.vat_rate) === 24 ? `ΦΠΑ ${vatText(row)}` : vatText(row)}
                      </span>
                    </p>
                  </div>
                  {canModify(row) && (
                    <div className="mt-2 flex justify-end gap-2">
                      <Button className="min-h-9 px-3 py-1" onClick={() => onEdit(row)}>
                        Επεξεργασία
                      </Button>
                      <Button variant="danger" className="min-h-9 px-3 py-1" onClick={() => onDelete(row)}>
                        Διαγραφή
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {/* Υπολογιστής/tablet: πίνακας */}
          <div className="-mx-5 hidden overflow-x-auto px-5 md:block">
            <table className="w-full min-w-[52rem] text-sm tabular-nums">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="py-2 pr-3 font-medium">Περίοδος</th>
                  <th className="py-2 pr-3 font-medium">Αυτοκίνητο</th>
                  <th className="py-2 pr-3 font-medium">Εφαρμογή</th>
                  <th className="py-2 pr-3 font-medium">Καταχώρηση</th>
                  <th className="py-2 pr-3 text-right font-medium">Διαδρομές</th>
                  <th className="py-2 pr-3 text-right font-medium">Έσοδα</th>
                  <th className="py-2 pr-3 text-right font-medium">Φιλοδ./Quest</th>
                  <th className="py-2 pr-3 text-right font-medium">Κράτηση</th>
                  <th className="py-2 pr-3 text-right font-medium">ΦΠΑ 24%</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((row) => {
                  const { plate, name } = vehicle(row);
                  const isWeek = row.kind === 'week';
                  const label = `${platformLabel(row.platform)} ${entryTitle(row)}`;
                  return (
                    <tr key={row.id} className={cx('border-t border-line', row.id === editingId && 'bg-warn-soft')}>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {monthName(row.month)} {row.year}
                      </td>
                      <td className="py-2 pr-3">
                        {plate ?? name}
                        {plate && <span className="block text-xs text-muted">{name}</span>}
                      </td>
                      <td className="py-2 pr-3">{platformLabel(row.platform)}</td>
                      <td className="py-2 pr-3 whitespace-nowrap">{entryTitle(row)}</td>
                      <td className="py-2 pr-3 text-right">{isWeek ? formatInteger(row.trips) : '—'}</td>
                      <td className="py-2 pr-3 text-right whitespace-nowrap">
                        {isWeek ? formatEuro(statementRevenueCents(row)) : '—'}
                      </td>
                      <td className="py-2 pr-3 text-right whitespace-nowrap">
                        {isWeek ? formatEuro(toCents(Number(row.tips))) : '—'}
                      </td>
                      <td className="py-2 pr-3 text-right font-semibold whitespace-nowrap">
                        {formatEuro(toCents(Number(row.commission)))}
                      </td>
                      <td className="py-2 pr-3 text-right whitespace-nowrap">{vatText(row)}</td>
                      <td className="py-2 text-right whitespace-nowrap">
                        {canModify(row) && (
                          <>
                            <Button
                              variant="ghost"
                              className="min-h-8 px-2 py-1"
                              onClick={() => onEdit(row)}
                              aria-label={`Επεξεργασία: ${label}`}
                            >
                              Επεξεργασία
                            </Button>
                            <Button
                              variant="ghost"
                              className="min-h-8 px-2 py-1 text-bad"
                              onClick={() => onDelete(row)}
                              aria-label={`Διαγραφή: ${label}`}
                            >
                              ✕
                            </Button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-3 border-t-2 border-line pt-2 text-sm tabular-nums">
            <dt>Διαδρομές εφαρμογών</dt>
            <dd className="text-right">{formatInteger(totals.trips)}</dd>
            <dt>Έσοδα εφαρμογών</dt>
            <dd className="text-right">{formatEuro(totals.turnoverCents)}</dd>
            {totals.tipsCents > 0 && (
              <>
                <dt>Φιλοδωρήματα / quest (χωρίς προμήθεια)</dt>
                <dd className="text-right">{formatEuro(totals.tipsCents)}</dd>
              </>
            )}
            <dt className="font-semibold">Κρατήσεις που μετράνε στα έξοδα</dt>
            <dd className="text-right font-semibold">{formatEuro(totals.commissionCents)}</dd>
            <dt className="text-muted">ΦΠΑ κρατήσεων 24% (συμψηφίζεται)</dt>
            <dd className="text-right text-muted">{formatEuro(totals.commissionVatCents)}</dd>
            {totals.commissionNoVatCents > 0 && (
              <>
                <dt className="text-muted">Κρατήσεις χωρίς ΦΠΑ (δεν συμψηφίζονται)</dt>
                <dd className="text-right text-muted">{formatEuro(totals.commissionNoVatCents)}</dd>
              </>
            )}
          </dl>
          <p className="mt-2 text-xs text-muted">
            Όπου υπάρχει τιμολόγιο μήνα μετράει το τιμολόγιο, αλλιώς οι εβδομάδες.
          </p>
        </>
      )}
    </Panel>
  );
}

const WEEK_STYLE = {
  done: 'border-good/30 bg-good-soft text-good',
  missing: 'border-bad/30 bg-bad-soft text-bad hover:border-bad',
  open: 'border-line bg-bg text-muted hover:border-accent-strong hover:text-fg',
} as const;

/** Μία εφαρμογή για ένα αυτοκίνητο και έναν μήνα: ποσοστό, εβδομάδες και τιμολόγιο. */
function PlatformMonthCard({
  platform,
  year,
  month,
  today,
  rateText,
  rows,
  group,
  onAddWeek,
}: {
  platform: PlatformId;
  year: number;
  month: number;
  today: string;
  /** Η ρύθμιση του αυτοκινήτου, π.χ. «15% + ΦΠΑ 24%». */
  rateText: string | null;
  rows: StatementRow[];
  group: PlatformMonth | null;
  onAddWeek: (weekStart: string) => void;
}) {
  const entered = new Set(rows.flatMap((row) => (row.kind === 'week' && row.week_start ? [row.week_start] : [])));
  const weeks = weekCycles(year, month);
  const invoice = group?.invoice ?? null;

  return (
    <section className="rounded-xl border border-line p-3" aria-label={`${platformLabel(platform)}: εβδομάδες και τιμολόγιο`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="font-semibold">{platformLabel(platform)}</h3>
        <p className="text-sm tabular-nums">
          Κράτηση <b>{formatEuro(group?.commissionCents ?? 0)}</b>
        </p>
      </div>
      <p className="text-xs text-muted">Ποσοστό: {rateText ?? 'δεν έχει οριστεί'}</p>
      <p className="text-xs text-muted tabular-nums">
        <span className="whitespace-nowrap">{formatInteger(group?.trips ?? 0)} διαδρομές</span> ·{' '}
        <span className="whitespace-nowrap">έσοδα {formatEuro(group?.turnoverCents ?? 0)}</span>
        {(group?.tipsCents ?? 0) > 0 && (
          <>
            {' · '}
            <span className="whitespace-nowrap">φιλοδ./quest {formatEuro(group!.tipsCents)}</span>
          </>
        )}
      </p>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {weeks.map((week) => {
          const state = weekState(week, entered, today);
          const chip = cx(
            'inline-flex min-h-8 items-center rounded-full border px-2.5 text-xs font-medium whitespace-nowrap',
            WEEK_STYLE[state],
          );
          const label = `${formatWeek(week.start, week.end)}${state === 'done' ? ' ✓' : state === 'missing' ? ' · λείπει' : ''}`;
          return (
            <li key={week.start}>
              {state === 'done' ? (
                <span className={chip}>{label}</span>
              ) : (
                // Εβδομάδα που λείπει ή τρέχει: ανοίγει τη φόρμα σε αυτή την εφαρμογή και εβδομάδα.
                <button
                  type="button"
                  onClick={() => onAddWeek(week.start)}
                  className={cx(
                    chip,
                    'cursor-pointer gap-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong',
                  )}
                >
                  <span aria-hidden="true">+</span>
                  <span className="sr-only">Καταχώρηση {platformLabel(platform)}:</span>
                  {label}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-sm">
        {invoice ? (
          <>
            <span className="font-medium text-good">Τιμολόγιο ✓</span>
            {invoice.reference && ` ${invoice.reference}`}: {formatEuro(invoice.commissionCents)}
            {group && group.weeks > 0 && invoice.commissionCents !== group.weeksCommissionCents && (
              <span className="text-muted">
                {' '}
                (εβδομάδες {formatEuro(group.weeksCommissionCents)}, διαφορά{' '}
                {formatSignedEuro(invoice.commissionCents - group.weeksCommissionCents)})
              </span>
            )}
          </>
        ) : (
          <span className="text-muted">Τιμολόγιο: δεν έχει καταχωρηθεί (μετράνε οι εβδομάδες)</span>
        )}
      </p>
    </section>
  );
}
