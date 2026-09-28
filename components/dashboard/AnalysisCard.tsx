'use client';

import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { Panel } from '@/components/Panel';
import { choiceStyles, cx } from '@/components/ui';
import type { ShiftFigures } from '@/lib/accounting';
import type { ChartMetric } from '@/lib/chart';
import { formatDecimal, formatEuro, formatInteger } from '@/lib/format';
import { monthName, periodLabel, type MonthFilter } from '@/lib/period';
import type { StatsView, TableGroup } from '@/lib/storage';
import {
  averageTripCents,
  buildShiftTable,
  monthRowsFromShifts,
  monthRowsFromSummary,
  sumRows,
  type MonthSummaryRow,
  type TableTotals,
} from '@/lib/table';
import type { DriverRow, ShiftRow } from '@/lib/types';
import { TrendChart } from './TrendChart';

/** Πόσες βάρδιες φαίνονται πριν το «Προβολή όλων». */
const SHIFT_ROWS = 31;

export interface YearSummary {
  rows: MonthSummaryRow[];
  loading: boolean;
  error: string | null;
}

/**
 * Κάρτα «Αναλυτικά»: Τζίρος, Διαδρομές και Μέση αξία διαδρομής, ως πίνακας
 * (προεπιλογή) ή ως γράφημα. Η επιλογή μένει αποθηκευμένη στη συσκευή.
 */
export function AnalysisCard({
  items,
  driversById,
  isAdmin,
  selectedDriver,
  year,
  month,
  view,
  onViewChange,
  tableGroup,
  onTableGroupChange,
  chartMetric,
  onChartMetricChange,
  yearSummary,
  onSelectMonth,
}: {
  items: { row: ShiftRow; figures: ShiftFigures }[];
  driversById: Map<string, DriverRow>;
  isAdmin: boolean;
  selectedDriver: DriverRow | null;
  year: number;
  month: MonthFilter;
  view: StatsView;
  onViewChange: (view: StatsView) => void;
  tableGroup: TableGroup;
  onTableGroupChange: (group: TableGroup) => void;
  chartMetric: ChartMetric;
  onChartMetricChange: (metric: ChartMetric) => void;
  /** Σύνολα όλων των μηνών του έτους (για «Ανά μήνα» όταν είναι ανοιχτός ένας μήνας). */
  yearSummary: YearSummary | null;
  onSelectMonth: (month: number) => void;
}) {
  const who = selectedDriver?.name ?? (isAdmin ? 'Όλος ο στόλος' : ([...driversById.values()][0]?.name ?? ''));
  const period = view === 'table' && tableGroup === 'months' ? `Έτος ${year}` : periodLabel(year, month);

  const subtitle = [who, period].filter(Boolean).join(' · ');

  return (
    <Panel
      id="analysis"
      headingLevel={3}
      title="Αναλυτικά"
      summary={`${subtitle} · πίνακας ή γράφημα`}
      data-testid="analysis-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="min-w-0 text-sm text-muted">{subtitle}</p>
        <div role="group" aria-label="Προβολή" className="flex rounded-xl bg-bg p-1">
          <ViewButton active={view === 'table'} onClick={() => onViewChange('table')} icon={<TableIcon />}>
            Πίνακας
          </ViewButton>
          <ViewButton active={view === 'chart'} onClick={() => onViewChange('chart')} icon={<ChartIcon />}>
            Γράφημα
          </ViewButton>
        </div>
      </div>

      {view === 'table' ? (
        <AnalysisTable
          items={items}
          driversById={driversById}
          year={year}
          month={month}
          group={tableGroup}
          onGroupChange={onTableGroupChange}
          yearSummary={yearSummary}
          onSelectMonth={onSelectMonth}
        />
      ) : (
        <TrendChart
          items={items}
          driversById={driversById}
          year={year}
          month={month}
          metric={chartMetric}
          onMetricChange={onChartMetricChange}
        />
      )}
    </Panel>
  );
}

function ViewButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        'inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 py-1 text-sm transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong',
        active ? choiceStyles.on : choiceStyles.off,
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function TableIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-[1.1em] w-[1.1em] shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <rect x="3" y="4" width="14" height="12" rx="2" />
      <path d="M3 8.5h14M3 12.5h14M8 8.5V16" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-[1.1em] w-[1.1em] shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 3.5V16.5H17" />
      <path d="M5.5 13l3.5-4 3 2.5 4-5" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Πίνακας
// ---------------------------------------------------------------------------

function AnalysisTable({
  items,
  driversById,
  year,
  month,
  group,
  onGroupChange,
  yearSummary,
  onSelectMonth,
}: {
  items: { row: ShiftRow; figures: ShiftFigures }[];
  driversById: Map<string, DriverRow>;
  year: number;
  month: MonthFilter;
  group: TableGroup;
  onGroupChange: (group: TableGroup) => void;
  yearSummary: YearSummary | null;
  onSelectMonth: (month: number) => void;
}) {
  return (
    <>
      <div role="group" aria-label="Γραμμές πίνακα" className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-bg p-1">
        {(
          [
            ['shifts', 'Ανά βάρδια'],
            ['months', 'Ανά μήνα'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={group === id}
            onClick={() => onGroupChange(id)}
            className={cx(
              'min-h-11 rounded-lg px-2 py-1 text-sm transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong',
              group === id ? choiceStyles.on : choiceStyles.off,
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {group === 'shifts' ? (
        <ShiftsTable items={items} driversById={driversById} month={month} />
      ) : (
        <MonthsTable
          items={items}
          year={year}
          month={month}
          yearSummary={yearSummary}
          onSelectMonth={onSelectMonth}
        />
      )}
    </>
  );
}

function money(cents: number): string {
  return formatEuro(Math.round(cents));
}

function averageTrip(totals: TableTotals): string {
  const value = averageTripCents(totals);
  return value === null ? '—' : money(value);
}

function shiftCount(count: number): string {
  return count === 1 ? '1 βάρδια' : `${formatInteger(count)} βάρδιες`;
}

interface MetricRow {
  key: string;
  /** Πρώτη στήλη, π.χ. «Ζ 902» ή το κουμπί του μήνα. */
  label: ReactNode;
  /** Δεύτερη γραμμή κάτω από την ετικέτα, π.χ. «20 βάρδιες». */
  sub?: string;
  totals: TableTotals;
  highlight?: boolean;
}

interface MetricSection {
  key: string;
  /** Επικεφαλίδα ομάδας, π.χ. «Γιώργος Παπαδόπουλος · 27 βάρδιες». */
  header?: string;
  rows: MetricRow[];
}

/**
 * Πίνακας με στήλες Τζίρος / Διαδρομές / Μέση αξία, σύνολο και μέσο όρο.
 * Με `stacked` (μεγάλες ετικέτες, π.χ. μήνες) στο κινητό η ετικέτα μπαίνει σε
 * δική της γραμμή πάνω από τα ποσά, ώστε οι αριθμοί να χωράνε πάντα στην οθόνη.
 */
function MetricsTable({
  firstColumn,
  caption,
  sections,
  total,
  totalLabel,
  averageLabel,
  averageCount,
  stacked = false,
}: {
  firstColumn: string;
  caption: string;
  sections: MetricSection[];
  total: TableTotals;
  totalLabel: string;
  averageLabel: string;
  averageCount: number;
  stacked?: boolean;
}) {
  const labelCell = cx('py-2 pr-2 text-left', stacked && 'hidden sm:table-cell');

  /** Στο κινητό (μόνο με `stacked`): η ετικέτα σε δική της γραμμή, πάνω από τα ποσά. */
  function mobileLabel(label: ReactNode, sub: string | undefined, style: { row?: string; cell: string }) {
    if (!stacked) return null;
    return (
      <tr className={cx('sm:hidden', style.row)}>
        <th scope="rowgroup" colSpan={3} className={cx('pt-2 text-left', style.cell)}>
          {label}
          {sub && <span className="ml-2 text-xs font-normal text-muted">{sub}</span>}
        </th>
      </tr>
    );
  }

  const bodies = stacked
    ? sections.flatMap((section) => section.rows.map((row) => ({ key: row.key, header: undefined, rows: [row] })))
    : sections;

  return (
    <div className="-mx-4 mt-3 overflow-x-auto px-4">
      <table className="w-full text-sm tabular-nums">
        <caption className="sr-only">{caption}</caption>
        <thead className="text-left text-xs text-muted">
          <tr>
            <th scope="col" className={cx('py-2 pr-2 font-medium', stacked && 'hidden sm:table-cell')}>
              {firstColumn}
            </th>
            <th scope="col" className="py-2 pr-2 text-right font-medium">
              Τζίρος
            </th>
            <th scope="col" className="py-2 pr-2 text-right font-medium">
              <span aria-hidden="true" className="sm:hidden">
                Διαδρ.
              </span>
              <span className="sr-only sm:not-sr-only">Διαδρομές</span>
            </th>
            <th scope="col" className="py-2 text-right font-medium">
              Μέση αξία
            </th>
          </tr>
        </thead>
        {bodies.map((section) => (
          <tbody key={section.key} className={cx(stacked && 'border-t border-line')}>
            {section.header && (
              <tr>
                <th scope="rowgroup" colSpan={4} className="bg-bg px-2 py-1.5 text-left text-xs font-semibold text-muted">
                  {section.header}
                </th>
              </tr>
            )}
            {section.rows.map((row) => (
              <Fragment key={row.key}>
                {mobileLabel(row.label, row.sub, { row: cx(row.highlight && 'bg-warn-soft'), cell: 'font-normal' })}
                <tr className={cx(!stacked && 'border-t border-line', row.highlight && 'bg-warn-soft')}>
                  <th scope="row" className={cx(labelCell, 'font-normal whitespace-nowrap')}>
                    {row.label}
                    {row.sub && <span className="block text-xs text-muted">{row.sub}</span>}
                  </th>
                  <td className="py-2 pr-2 text-right whitespace-nowrap">{money(row.totals.grossCents)}</td>
                  <td className="py-2 pr-2 text-right">{formatInteger(row.totals.trips)}</td>
                  <td className="py-2 text-right whitespace-nowrap">{averageTrip(row.totals)}</td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        ))}
        <tfoot className="border-t-2 border-line">
          {mobileLabel(totalLabel, shiftCount(total.shifts), { cell: 'font-semibold' })}
          <tr className="font-semibold">
            <th scope="row" className={labelCell}>
              {totalLabel}
              <span className="block text-xs font-normal text-muted">{shiftCount(total.shifts)}</span>
            </th>
            <td className="py-2 pr-2 text-right whitespace-nowrap">{money(total.grossCents)}</td>
            <td className="py-2 pr-2 text-right">{formatInteger(total.trips)}</td>
            <td className="py-2 text-right whitespace-nowrap">{averageTrip(total)}</td>
          </tr>
          {averageCount > 1 && (
            <>
              {mobileLabel(averageLabel, undefined, { cell: 'font-normal text-muted' })}
              <tr className="text-muted">
                <th scope="row" className={cx(labelCell, 'font-normal')}>
                  {averageLabel}
                </th>
                <td className="pb-2 pr-2 text-right whitespace-nowrap">{money(total.grossCents / averageCount)}</td>
                <td className="pb-2 pr-2 text-right">{formatDecimal(total.trips / averageCount)}</td>
                <td className="pb-2" />
              </tr>
            </>
          )}
        </tfoot>
      </table>
    </div>
  );
}

function EmptyTable({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 flex min-h-32 items-center justify-center rounded-xl bg-bg px-4 py-6 text-center text-sm text-muted">
      {children}
    </p>
  );
}

function ShiftsTable({
  items,
  driversById,
  month,
}: {
  items: { row: ShiftRow; figures: ShiftFigures }[];
  driversById: Map<string, DriverRow>;
  month: MonthFilter;
}) {
  const [showAll, setShowAll] = useState(false);
  const drivers = useMemo(() => [...driversById.values()], [driversById]);
  const { entries, total } = useMemo(() => buildShiftTable(items, { month, drivers }), [items, month, drivers]);

  if (items.length === 0) return <EmptyTable>Δεν υπάρχουν βάρδιες για αυτή την περίοδο.</EmptyTable>;

  // Ομάδες (μήνας/οδηγός) με τις βάρδιές τους· όριο οι πρώτες SHIFT_ROWS βάρδιες.
  const sections: MetricSection[] = [];
  let count = 0;
  for (const entry of entries) {
    if (entry.kind === 'group') {
      sections.push({ key: entry.key, header: `${entry.label} · ${shiftCount(entry.shifts)}`, rows: [] });
      continue;
    }
    if (!showAll && count >= SHIFT_ROWS) break;
    count += 1;
    if (sections.length === 0) sections.push({ key: 'all', rows: [] });
    sections[sections.length - 1].rows.push({ key: entry.key, label: `Ζ ${entry.zNumber}`, totals: entry.totals });
  }

  return (
    <>
      <MetricsTable
        firstColumn="Βάρδια"
        caption="Τζίρος, διαδρομές και μέση αξία διαδρομής ανά βάρδια"
        sections={sections.filter((section) => section.rows.length > 0)}
        total={total}
        totalLabel="Σύνολο"
        averageLabel="Μ.Ο. ανά βάρδια"
        averageCount={total.shifts}
      />
      {!showAll && total.shifts > SHIFT_ROWS && (
        <div className="mt-3 text-center">
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="min-h-11 rounded-xl border border-line px-4 text-sm hover:bg-bg focus-visible:outline-2 focus-visible:outline-accent-strong"
          >
            Προβολή όλων ({total.shifts})
          </button>
        </div>
      )}
    </>
  );
}

function MonthsTable({
  items,
  year,
  month,
  yearSummary,
  onSelectMonth,
}: {
  items: { row: ShiftRow; figures: ShiftFigures }[];
  year: number;
  month: MonthFilter;
  yearSummary: YearSummary | null;
  onSelectMonth: (month: number) => void;
}) {
  // «Όλοι οι μήνες»: οι βάρδιες του έτους έχουν ήδη φορτωθεί. Αλλιώς: σύνολα της βάσης
  // για τους άλλους μήνες και ο ανοιχτός μήνας από τις βάρδιες της σελίδας.
  const rows = useMemo(
    () =>
      month === 'all'
        ? monthRowsFromShifts(items)
        : monthRowsFromSummary(yearSummary?.rows ?? [], { month, items }),
    [items, month, yearSummary],
  );
  const loading = month !== 'all' && (yearSummary === null || yearSummary.loading);

  if (yearSummary?.error && month !== 'all') {
    return <EmptyTable>Τα σύνολα του έτους δεν φορτώθηκαν. {yearSummary.error}</EmptyTable>;
  }
  if (rows.length === 0) {
    return <EmptyTable>{loading ? 'Φόρτωση…' : `Δεν υπάρχουν βάρδιες για το ${year}.`}</EmptyTable>;
  }

  const section: MetricSection = {
    key: 'months',
    rows: rows.map((row) => ({
      key: String(row.month),
      label: (
        <button
          type="button"
          onClick={() => onSelectMonth(row.month)}
          aria-current={row.month === month ? 'true' : undefined}
          className="text-left font-medium underline decoration-muted/50 underline-offset-4 hover:decoration-fg focus-visible:outline-2 focus-visible:outline-accent-strong"
        >
          {monthName(row.month)}
        </button>
      ),
      sub: shiftCount(row.totals.shifts),
      totals: row.totals,
      highlight: row.month === month,
    })),
  };

  return (
    <div className={cx('transition-opacity', loading && 'opacity-50')} aria-busy={loading}>
      <MetricsTable
        firstColumn="Μήνας"
        caption={`Τζίρος, διαδρομές και μέση αξία διαδρομής ανά μήνα, ${year}`}
        sections={[section]}
        total={sumRows(rows)}
        totalLabel={`Έτος ${year}`}
        averageLabel="Μ.Ο. ανά μήνα"
        averageCount={rows.length}
        stacked
      />
      <p className="mt-2 text-xs text-muted">Πατήστε έναν μήνα για να δείτε τις βάρδιές του.</p>
    </div>
  );
}
