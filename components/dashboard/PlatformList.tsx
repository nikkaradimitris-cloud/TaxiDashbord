'use client';

import { Button, Card, cx } from '@/components/ui';
import { toCents } from '@/lib/accounting';
import { formatDateTime, formatEuro, formatInteger, formatPercent, formatSignedEuro } from '@/lib/format';
import { monthName, type MonthFilter } from '@/lib/period';
import {
  commissionRatePct,
  formatWeek,
  PLATFORMS,
  platformHasVat,
  platformLabel,
  weekCycles,
  weekState,
  type PlatformMonth,
} from '@/lib/platforms';
import type { DriverRow, StatementRow } from '@/lib/types';

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

/**
 * Οι καταχωρήσεις εφαρμογών της περιόδου. Για ένα αυτοκίνητο και έναν μήνα
 * δείχνει ανά εφαρμογή ποιες εβδομάδες έχουν μπει, ποιες λείπουν και αν
 * υπάρχει το τιμολόγιο του μήνα.
 */
export function PlatformList({
  statements,
  months,
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
}: {
  statements: StatementRow[];
  /** Ανά αυτοκίνητο, μήνα και εφαρμογή (κράτηση: τιμολόγιο ή εβδομάδες). */
  months: PlatformMonth[];
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
}) {
  // Ο οδηγός διορθώνει/διαγράφει δικές του καταχωρήσεις μόνο μέσα σε 24 ώρες (ο κανόνας ισχύει και στη βάση).
  const canModify = (row: StatementRow) =>
    isAdmin || (row.created_by === userId && Date.parse(row.created_at) > fetchedAt - DAY_MS);
  const sorted = [...statements].sort(compareStatements);
  const totals = months.reduce(
    (sum, group) => ({
      trips: sum.trips + group.trips,
      turnoverCents: sum.turnoverCents + group.turnoverCents,
      commissionCents: sum.commissionCents + group.commissionCents,
      commissionVatCents: sum.commissionVatCents + group.commissionVatCents,
    }),
    { trips: 0, turnoverCents: 0, commissionCents: 0, commissionVatCents: 0 },
  );
  const checklist = month !== 'all' && carId !== null;

  const vehicle = (row: StatementRow) => {
    const driver = driversById.get(row.driver_id);
    return { plate: driver?.plate ?? null, name: driver?.name ?? '—' };
  };

  return (
    <Card
      id="platforms"
      title={`Εφαρμογές · ${periodText}`}
      actions={
        <span className="text-sm text-muted">
          {loading ? 'Φόρτωση…' : statements.length === 1 ? '1 καταχώρηση' : `${statements.length} καταχωρήσεις`}
        </span>
      }
      className={cx(loading && 'opacity-60')}
    >
      {checklist ? (
        <div className="mb-4 grid gap-3 md:grid-cols-2">
          {PLATFORMS.map(({ id }) => (
            <PlatformMonthCard
              key={id}
              platform={id}
              year={year}
              month={month}
              today={today}
              rows={statements.filter((row) => row.driver_id === carId && row.month === month && row.platform === id)}
              group={months.find((group) => group.driverId === carId && group.month === month && group.platform === id) ?? null}
            />
          ))}
        </div>
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
                          <span className="whitespace-nowrap">τζίρος {formatEuro(toCents(Number(row.turnover)))}</span>
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
                        {platformHasVat(row.platform) ? `ΦΠΑ ${formatEuro(toCents(Number(row.commission_vat ?? 0)))}` : 'χωρίς ΦΠΑ'}
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
            <table className="w-full min-w-[48rem] text-sm tabular-nums">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="py-2 pr-3 font-medium">Περίοδος</th>
                  <th className="py-2 pr-3 font-medium">Αυτοκίνητο</th>
                  <th className="py-2 pr-3 font-medium">Εφαρμογή</th>
                  <th className="py-2 pr-3 font-medium">Καταχώρηση</th>
                  <th className="py-2 pr-3 text-right font-medium">Διαδρομές</th>
                  <th className="py-2 pr-3 text-right font-medium">Τζίρος</th>
                  <th className="py-2 pr-3 text-right font-medium">Κράτηση</th>
                  <th className="py-2 pr-3 text-right font-medium">ΦΠΑ 24%</th>
                  <th className="py-2 pr-3 font-medium">Καταχωρήθηκε</th>
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
                        {isWeek ? formatEuro(toCents(Number(row.turnover))) : '—'}
                      </td>
                      <td className="py-2 pr-3 text-right font-semibold whitespace-nowrap">
                        {formatEuro(toCents(Number(row.commission)))}
                      </td>
                      <td className="py-2 pr-3 text-right whitespace-nowrap">
                        {platformHasVat(row.platform) ? formatEuro(toCents(Number(row.commission_vat ?? 0))) : 'χωρίς ΦΠΑ'}
                      </td>
                      <td className="py-2 pr-3 text-xs whitespace-nowrap text-muted">{formatDateTime(row.created_at)}</td>
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
            <dt>Τζίρος εφαρμογών</dt>
            <dd className="text-right">{formatEuro(totals.turnoverCents)}</dd>
            <dt className="font-semibold">Κρατήσεις που μετράνε στα έξοδα</dt>
            <dd className="text-right font-semibold">{formatEuro(totals.commissionCents)}</dd>
            <dt className="text-muted">ΦΠΑ κρατήσεων 24% (συμψηφίζεται)</dt>
            <dd className="text-right text-muted">{formatEuro(totals.commissionVatCents)}</dd>
          </dl>
          <p className="mt-2 text-xs text-muted">
            Όπου υπάρχει τιμολόγιο μήνα μετράει το τιμολόγιο, αλλιώς οι εβδομάδες. Η Uber τιμολογεί χωρίς ΦΠΑ.
          </p>
        </>
      )}
    </Card>
  );
}

const WEEK_STYLE = {
  done: 'border-good/30 bg-good-soft text-good',
  missing: 'border-bad/30 bg-bad-soft text-bad',
  open: 'border-line bg-bg text-muted',
} as const;

/** Μία εφαρμογή για ένα αυτοκίνητο και έναν μήνα: εβδομάδες και τιμολόγιο. */
function PlatformMonthCard({
  platform,
  year,
  month,
  today,
  rows,
  group,
}: {
  platform: string;
  year: number;
  month: number;
  today: string;
  rows: StatementRow[];
  group: PlatformMonth | null;
}) {
  const entered = new Set(rows.flatMap((row) => (row.kind === 'week' && row.week_start ? [row.week_start] : [])));
  const weeks = weekCycles(year, month);
  const invoice = group?.invoice ?? null;
  const ratePct = group ? commissionRatePct(group) : null;

  return (
    <section className="rounded-xl border border-line p-3" aria-label={`${platformLabel(platform)}: εβδομάδες και τιμολόγιο`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="font-semibold">{platformLabel(platform)}</h3>
        <p className="text-sm tabular-nums">
          Κράτηση <b>{formatEuro(group?.commissionCents ?? 0)}</b>
        </p>
      </div>
      <p className="text-xs text-muted tabular-nums">
        <span className="whitespace-nowrap">{formatInteger(group?.trips ?? 0)} διαδρομές</span> ·{' '}
        <span className="whitespace-nowrap">τζίρος {formatEuro(group?.turnoverCents ?? 0)}</span>
        {ratePct !== null && (
          <>
            {' · '}
            <span className="whitespace-nowrap">κράτηση {formatPercent(ratePct)}</span>
          </>
        )}
      </p>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {weeks.map((week) => {
          const state = weekState(week, entered, today);
          return (
            <li
              key={week.start}
              className={cx('rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap', WEEK_STYLE[state])}
            >
              {formatWeek(week.start, week.end)}
              {state === 'done' ? ' ✓' : state === 'missing' ? ' · λείπει' : ''}
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
