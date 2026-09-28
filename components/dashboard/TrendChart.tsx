'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { cx } from '@/components/ui';
import type { ShiftFigures } from '@/lib/accounting';
import {
  buildChartData,
  CHART_METRICS,
  MAX_SERIES,
  niceTicks,
  type ChartData,
  type ChartMetric,
  type ChartPoint,
  type ChartSeries,
} from '@/lib/chart';
import { formatDecimal, formatEuro, formatEuroTick, formatInteger } from '@/lib/format';
import type { MonthFilter } from '@/lib/period';
import type { DriverRow, ShiftRow } from '@/lib/types';

const METRIC_TITLE: Record<ChartMetric, string> = {
  gross: 'Τζίρος',
  trips: 'Διαδρομές',
  avgTrip: 'Μέση αξία διαδρομής',
};

const METRIC_NOTE: Record<ChartMetric, string> = {
  gross: 'Μικτή είσπραξη: καθαρά + ΦΠΑ 13% + φιλοδωρήματα.',
  trips: 'Πλήθος διαδρομών όπως καταχωρήθηκαν.',
  avgTrip: '(Καθαρά + ΦΠΑ 13%) ÷ διαδρομές — χωρίς φιλοδωρήματα.',
};

function formatValue(metric: ChartMetric, value: number): string {
  if (metric === 'trips') return Number.isInteger(value) ? formatInteger(value) : formatDecimal(value);
  return formatEuro(Math.round(value));
}

function seriesColor(series: ChartSeries): string {
  return series.color === null ? 'var(--chart-other)' : `var(--chart-${series.color + 1})`;
}

/** Γραμμή κάτω από την τιμή στο tooltip/πίνακα: οδηγός, Ζ, βάρδιες, υπολογισμός μέσης αξίας. */
function pointDetail(data: ChartData, series: ChartSeries, point: ChartPoint): string {
  const multi = data.series.length > 1;
  const parts: string[] = [];
  if (multi) parts.push(series.name);
  if (multi && point.zNumber) parts.push(`Ζ\u00a0${point.zNumber}`);
  if (data.mode === 'months') parts.push(point.shifts === 1 ? '1\u00a0βάρδια' : `${point.shifts}\u00a0βάρδιες`);
  if (data.metric === 'avgTrip') parts.push(`${formatEuro(point.fareCents)}\u00a0÷\u00a0${point.trips}\u00a0διαδρ.`);
  return parts.join(' · ');
}

export function TrendChart({
  items,
  driversById,
  year,
  month,
  metric,
  onMetricChange,
}: {
  items: { row: ShiftRow; figures: ShiftFigures }[];
  driversById: Map<string, DriverRow>;
  year: number;
  month: MonthFilter;
  metric: ChartMetric;
  onMetricChange: (metric: ChartMetric) => void;
}) {
  const drivers = useMemo(() => [...driversById.values()], [driversById]);
  const data = useMemo(
    () => buildChartData(items, { metric, year, month, drivers }),
    [items, metric, year, month, drivers],
  );
  const [showTable, setShowTable] = useState(false);

  const title = `${METRIC_TITLE[metric]} ανά ${data.mode === 'shifts' ? 'βάρδια' : 'μήνα'}`;
  const who = data.series.length === 1 ? data.series[0].name : data.series.length > 1 ? 'Ένα χρώμα ανά οδηγό' : null;
  const subtitle = [who, data.mode === 'shifts' ? 'σειρά αριθμού Ζ' : `έτος ${year}`].filter(Boolean).join(' · ');
  const hasValues = data.series.some((series) => series.points.some((point) => point.value !== null));

  return (
    <div className="rounded-2xl border border-line bg-card p-4 shadow-sm" data-testid="trend-chart">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">{title}</h3>
          <p className="text-xs text-muted">{subtitle}</p>
        </div>
        {data.average !== null && (
          <div className="shrink-0 text-right">
            <p className="flex items-center justify-end gap-1.5 text-xs text-muted">
              <AverageKey />
              {data.averageLabel}
            </p>
            <p className="font-semibold">{formatValue(metric, data.average)}</p>
          </div>
        )}
      </div>

      <div role="group" aria-label="Τι δείχνει το γράφημα" className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-bg p-1">
        {CHART_METRICS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            aria-pressed={metric === id}
            onClick={() => onMetricChange(id)}
            className={cx(
              'min-h-11 rounded-lg px-2 py-1 text-sm leading-tight transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong',
              metric === id ? 'bg-accent font-semibold text-on-accent shadow-sm' : 'text-muted hover:bg-card hover:text-fg',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">{METRIC_NOTE[metric]}</p>

      {data.series.length > 1 && (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Οδηγοί">
          {data.series.map((series) => (
            <li key={series.driverId} className="flex items-center gap-1.5">
              <span aria-hidden="true" className="h-0.5 w-4 rounded-full" style={{ background: seriesColor(series) }} />
              {series.name}
            </li>
          ))}
        </ul>
      )}

      {!hasValues ? (
        <p className="mt-3 flex h-56 items-center justify-center rounded-xl bg-bg px-4 text-center text-sm text-muted">
          {items.length === 0
            ? 'Δεν υπάρχουν βάρδιες για αυτή την περίοδο.'
            : 'Δεν υπάρχουν διαδρομές για τον υπολογισμό της μέσης αξίας.'}
        </p>
      ) : showTable ? (
        <ChartTable data={data} />
      ) : (
        <Plot data={data} title={title} />
      )}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">
          {data.hiddenDrivers > 0 &&
            `Εμφανίζονται οι ${MAX_SERIES} οδηγοί με τον μεγαλύτερο τζίρο· για τους άλλους ${data.hiddenDrivers} επιλέξτε οδηγό στο φίλτρο.`}
        </p>
        {hasValues && (
          <button
            type="button"
            onClick={() => setShowTable((value) => !value)}
            className="min-h-8 rounded-lg px-2 text-xs font-medium text-muted underline hover:text-fg focus-visible:outline-2 focus-visible:outline-accent-strong"
          >
            {showTable ? 'Προβολή γραφήματος' : 'Προβολή πίνακα'}
          </button>
        )}
      </div>
    </div>
  );
}

function AverageKey() {
  return (
    <svg width="16" height="4" aria-hidden="true" className="shrink-0">
      <line x1="0" y1="2" x2="16" y2="2" stroke="var(--muted)" strokeWidth="1.5" strokeDasharray="4 3" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Γράφημα (SVG)
// ---------------------------------------------------------------------------

const PLOT_TOP = 18; // χώρος για την ετικέτα της τελευταίας τιμής
const AXIS_BAND = 24; // ετικέτες του άξονα Χ
const RIGHT_PAD = 8;
const TICK_FONT = 11;

/** Θέση του τελευταίου σημείου με τιμή (-1 αν δεν υπάρχει). */
function lastValueIndex(points: ChartPoint[]): number {
  for (let index = points.length - 1; index >= 0; index--) if (points[index].value !== null) return index;
  return -1;
}

/** Συνεχόμενα σημεία με τιμή (τα κενά σπάνε τη γραμμή). */
function runs(points: ChartPoint[]): number[][] {
  const result: number[][] = [];
  let current: number[] = [];
  points.forEach((point, index) => {
    if (point.value === null) {
      if (current.length) result.push(current);
      current = [];
    } else {
      current.push(index);
    }
  });
  if (current.length) result.push(current);
  return result;
}

function Plot({ data, title }: { data: ChartData; title: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const { metric, series } = data;
  const count = data.xLabels.length;
  const current = active !== null && active < count ? active : null;
  const single = series.length === 1;

  const plotHeight = width > 0 && width < 480 ? 176 : 208;
  const height = PLOT_TOP + plotHeight + AXIS_BAND;
  const bottom = PLOT_TOP + plotHeight;

  // Άξονας Υ: από το 0, με «στρογγυλές» υποδιαιρέσεις.
  const integer = metric === 'trips';
  const ticks = niceTicks(Math.max(data.maxValue * 1.05, integer ? 1 : 100), { integer });
  const yMax = ticks[ticks.length - 1];
  const tickText = (value: number) => (integer ? formatInteger(value) : formatEuroTick(value));
  const left = Math.max(...ticks.map((tick) => tickText(tick).length)) * 6.5 + 10;
  const plotWidth = Math.max(0, width - left - RIGHT_PAD);
  const slot = count > 0 ? plotWidth / count : 0;
  const x = (index: number) => left + (index + 0.5) * slot;
  const y = (value: number) => bottom - (value / yMax) * plotHeight;

  // Άξονας Χ: αραίωση ετικετών ώστε να μην πέφτουν η μία πάνω στην άλλη.
  const labelChars = Math.max(1, ...data.xLabels.map((label) => label.length));
  const labelEvery = Math.max(1, Math.ceil((labelChars * 7 + 10) / Math.max(slot, 1)));

  const lastWithData = Math.max(-1, ...series.map((s) => lastValueIndex(s.points)));

  function indexAt(event: PointerEvent<SVGSVGElement>): number {
    const rect = event.currentTarget.getBoundingClientRect();
    const position = Math.floor((event.clientX - rect.left - left) / Math.max(slot, 1));
    return Math.min(count - 1, Math.max(0, position));
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (count === 0) return;
    const last = count - 1;
    let next: number | null;
    if (event.key === 'ArrowLeft') next = current === null ? last : Math.max(0, current - 1);
    else if (event.key === 'ArrowRight') next = current === null ? 0 : Math.min(last, current + 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = last;
    else if (event.key === 'Escape') next = null;
    else return;
    event.preventDefault();
    setActive(next);
  }

  const rows =
    current === null
      ? []
      : series
          .map((s) => ({ series: s, point: s.points[current] }))
          .filter((row): row is { series: ChartSeries; point: ChartPoint & { value: number } } => row.point.value !== null);

  const description =
    current === null
      ? ''
      : `${data.xTitles[current]}: ${
          rows.length
            ? rows
                .map(({ series: s, point }) => [formatValue(metric, point.value), pointDetail(data, s, point)].filter(Boolean).join(', '))
                .join('; ')
            : 'χωρίς βάρδια'
        }`;

  // Tooltip δίπλα στην κάθετη γραμμή (από την πλευρά με τον περισσότερο χώρο), πάνω ή κάτω
  // ανάλογα με το πού βρίσκονται τα σημεία· αν δεν χωράει, μετακινείται ώστε να μένει μέσα στο γράφημα.
  const highest = rows.length ? Math.max(...rows.map((row) => row.point.value)) : 0;
  const tooltipBelow = current !== null && y(highest) < PLOT_TOP + plotHeight / 2;
  let tooltipStyle: CSSProperties = {};
  if (current !== null) {
    const spaceRight = width - x(current) - 14;
    const spaceLeft = x(current) - 14;
    tooltipStyle =
      spaceRight >= spaceLeft
        ? { left: x(current) + 12, transform: `translateX(min(0px, calc(${spaceRight}px - 100%)))` }
        : { right: width - x(current) + 12, transform: `translateX(max(0px, calc(100% - ${spaceLeft}px)))` };
    tooltipStyle = { ...tooltipStyle, ...(tooltipBelow ? { bottom: AXIS_BAND + 6 } : { top: PLOT_TOP }) };
  }

  return (
    <div
      ref={box}
      tabIndex={0}
      role="group"
      aria-label={`${title}. Με τα βελάκια ←/→ ακούτε τις τιμές.`}
      onKeyDown={onKeyDown}
      onFocus={() => setActive((previous) => previous ?? (lastWithData >= 0 ? lastWithData : null))}
      onBlur={() => setActive(null)}
      className="relative mt-3 rounded-lg outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-strong"
      style={{ height }}
    >
      {width > 0 && (
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          aria-hidden="true"
          className="block touch-pan-y tabular-nums select-none"
          onPointerDown={(event) => setActive(indexAt(event))}
          onPointerMove={(event) => setActive(indexAt(event))}
          onPointerLeave={(event) => {
            if (event.pointerType !== 'touch') setActive(null);
          }}
        >
          {/* Οριζόντιες γραμμές πλέγματος και τιμές άξονα Υ */}
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={left}
                x2={left + plotWidth}
                y1={y(tick)}
                y2={y(tick)}
                stroke={tick === 0 ? 'var(--muted)' : 'var(--line)'}
                strokeOpacity={tick === 0 ? 0.45 : 1}
                strokeWidth={1}
                shapeRendering="crispEdges"
              />
              <text x={left - 8} y={y(tick)} dy="0.32em" textAnchor="end" fontSize={TICK_FONT} fill="var(--muted)">
                {tickText(tick)}
              </text>
            </g>
          ))}

          {/* Ετικέτες άξονα Χ */}
          {data.xLabels.map((label, index) =>
            index % labelEvery === 0 ? (
              <text
                key={index}
                x={x(index)}
                y={bottom + 16}
                textAnchor="middle"
                fontSize={TICK_FONT}
                fill={index === current ? 'var(--fg)' : 'var(--muted)'}
              >
                {label}
              </text>
            ) : null,
          )}

          {/* Μέσος όρος */}
          {data.average !== null && (
            <line
              x1={left}
              x2={left + plotWidth}
              y1={y(data.average)}
              y2={y(data.average)}
              stroke="var(--muted)"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          )}

          {/* Σκίαση κάτω από τη γραμμή (μόνο με έναν οδηγό) */}
          {single &&
            runs(series[0].points)
              .filter((run) => run.length > 1)
              .map((run) => (
                <path
                  key={`area-${run[0]}`}
                  d={`M${x(run[0])},${bottom} ${run.map((i) => `L${x(i)},${y(series[0].points[i].value!)}`).join(' ')} L${x(run[run.length - 1])},${bottom} Z`}
                  fill={seriesColor(series[0])}
                  fillOpacity={0.1}
                />
              ))}

          {/* Γραμμές */}
          {series.map((s) =>
            runs(s.points)
              .filter((run) => run.length > 1)
              .map((run) => (
                <path
                  key={`${s.driverId}-${run[0]}`}
                  d={run.map((i, k) => `${k === 0 ? 'M' : 'L'}${x(i)},${y(s.points[i].value!)}`).join(' ')}
                  fill="none"
                  stroke={seriesColor(s)}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              )),
          )}

          {/* Κάθετη γραμμή στο επιλεγμένο σημείο */}
          {current !== null && (
            <line
              x1={x(current)}
              x2={x(current)}
              y1={PLOT_TOP}
              y2={bottom}
              stroke="var(--muted)"
              strokeOpacity={0.6}
              strokeWidth={1}
              shapeRendering="crispEdges"
            />
          )}

          {/* Σημεία: όλα όταν είναι λίγα, αλλιώς τα μεμονωμένα και το τελευταίο */}
          {series.map((s) => {
            const last = lastValueIndex(s.points);
            return s.points.map((point, index) => {
              if (point.value === null) return null;
              const isolated = s.points[index - 1]?.value == null && s.points[index + 1]?.value == null;
              const isActive = index === current;
              if (!(count <= 16 || isolated || index === last || isActive)) return null;
              return (
                <circle
                  key={`${s.driverId}-${index}`}
                  cx={x(index)}
                  cy={y(point.value)}
                  r={isActive ? 5 : 4}
                  fill={seriesColor(s)}
                  stroke="var(--card)"
                  strokeWidth={2}
                />
              );
            });
          })}

          {/* Τιμή της τελευταίας βάρδιας/του τελευταίου μήνα (μόνο με έναν οδηγό) */}
          {single &&
            current === null &&
            (() => {
              const index = lastValueIndex(series[0].points);
              if (index < 0) return null;
              const value = series[0].points[index].value!;
              const text = formatValue(metric, value);
              const px = x(index);
              const py = y(value);
              const beside = px + 10 + text.length * 6.6 <= left + plotWidth;
              const anchor = beside ? 'start' : px > left + plotWidth - 44 ? 'end' : px < left + 44 ? 'start' : 'middle';
              return (
                <text
                  x={beside ? px + 10 : px}
                  y={beside ? py : py - 10 < PLOT_TOP ? py + 20 : py - 10}
                  dy={beside ? '0.32em' : undefined}
                  textAnchor={anchor}
                  fontSize={TICK_FONT}
                  fontWeight={600}
                  fill="var(--fg)"
                  stroke="var(--card)"
                  strokeWidth={3}
                  paintOrder="stroke"
                >
                  {text}
                </text>
              );
            })()}
        </svg>
      )}

      {current !== null && width > 0 && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute z-10 w-max max-w-[18rem] rounded-xl border border-line bg-card px-3 py-2 text-sm shadow-lg"
          style={tooltipStyle}
        >
          <p className="text-xs text-muted">{data.xTitles[current]}</p>
          {rows.length === 0 ? (
            <p className="text-xs text-muted">Χωρίς βάρδια</p>
          ) : (
            <ul className="mt-0.5 space-y-0.5">
              {rows.map(({ series: s, point }) => {
                const detail = pointDetail(data, s, point);
                return (
                  <li key={s.driverId} className="flex items-baseline gap-2">
                    <span
                      className="h-0.5 w-3 shrink-0 self-center rounded-full"
                      style={{ background: seriesColor(s) }}
                    />
                    <span className="font-semibold tabular-nums">{formatValue(metric, point.value)}</span>
                    {detail && <span className="min-w-0 text-xs text-muted">{detail}</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <p className="sr-only" aria-live="polite">
        {description}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Πίνακας (οι ίδιες τιμές χωρίς γράφημα)
// ---------------------------------------------------------------------------

function ChartTable({ data }: { data: ChartData }) {
  const multi = data.series.length > 1;
  const rows = data.xTitles
    .map((title, index) => ({ index, title, points: data.series.map((series) => series.points[index]) }))
    .filter((row) => row.points.some((point) => point.shifts > 0));

  return (
    <div className="-mx-4 mt-3 overflow-x-auto px-4">
      <table className="w-full text-sm tabular-nums">
        <thead className="text-left text-xs text-muted">
          <tr>
            <th className="py-1 pr-3 font-medium">{data.mode === 'months' ? 'Μήνας' : 'Βάρδια'}</th>
            {data.series.map((series) => (
              <th key={series.driverId} className="py-1 pr-3 text-right font-medium last:pr-0">
                {multi ? series.name : METRIC_TITLE[data.metric]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.index} className="border-t border-line">
              <td className="py-1.5 pr-3 whitespace-nowrap">{row.title}</td>
              {row.points.map((point, index) => {
                const detail = point.value === null ? '' : pointDetail(data, data.series[index], point);
                return (
                  <td key={data.series[index].driverId} className="py-1.5 pr-3 text-right whitespace-nowrap last:pr-0">
                    {point.value === null ? '—' : formatValue(data.metric, point.value)}
                    {detail && <span className="block text-xs text-muted">{detail}</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        {data.average !== null && (
          <tfoot>
            <tr className="border-t border-line font-semibold">
              <td className="py-1.5 pr-3">{data.averageLabel}</td>
              <td colSpan={data.series.length} className="py-1.5 text-right">
                {formatValue(data.metric, data.average)}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
