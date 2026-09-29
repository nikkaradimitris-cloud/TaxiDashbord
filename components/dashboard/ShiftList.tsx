'use client';

import { useState } from 'react';
import { Panel } from '@/components/Panel';
import { Badge, Button, cx, Notice } from '@/components/ui';
import type { ShiftFigures } from '@/lib/accounting';
import { formatDateTime, formatEuro, formatKm } from '@/lib/format';
import { monthName } from '@/lib/period';
import type { DriverRow, ShiftRow } from '@/lib/types';
import { jumpText, missingZText, zGapBadge, type CarZGaps } from '@/lib/zgaps';

const PAGE = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

export function ShiftList({
  items,
  loading,
  driversById,
  isAdmin,
  userId,
  fetchedAt,
  periodText,
  editingId,
  onEdit,
  onDelete,
  zGaps = [],
}: {
  items: { row: ShiftRow; figures: ShiftFigures }[];
  loading: boolean;
  driversById: Map<string, DriverRow>;
  isAdmin: boolean;
  userId: string;
  fetchedAt: number;
  periodText: string;
  editingId: string | null;
  onEdit: (row: ShiftRow) => void;
  onDelete: (row: ShiftRow) => void;
  /** Ζ που λείπουν ανάμεσα στις βάρδιες κάθε αυτοκινήτου (μόνο για τον ιδιοκτήτη). */
  zGaps?: CarZGaps[];
}) {
  const [limit, setLimit] = useState(PAGE);
  const visible = items.slice(0, limit);
  const grossCents = items.reduce((sum, item) => sum + item.figures.grossReceiptsCents, 0);
  const zBadge = loading ? null : zGapBadge(zGaps);

  // Ο οδηγός διορθώνει/διαγράφει δικές του καταχωρήσεις μόνο μέσα σε 24 ώρες (ο κανόνας ισχύει και στη βάση).
  const canModify = (row: ShiftRow) =>
    isAdmin || (row.created_by === userId && Date.parse(row.created_at) > fetchedAt - DAY_MS);

  return (
    <Panel
      id="shifts"
      title={`Ιστορικό Βαρδιών · ${periodText}`}
      summary={
        loading
          ? 'Φόρτωση…'
          : items.length === 0
            ? 'Καμία βάρδια'
            : `${items.length === 1 ? '1 βάρδια' : `${items.length} βάρδιες`} · μικτή είσπραξη ${formatEuro(grossCents)}`
      }
      badge={zBadge ? <Badge tone="warn">{zBadge}</Badge> : null}
      className={cx(loading && 'opacity-60')}
    >
      {zBadge && (
        <Notice tone="warning" className="mb-3">
          <p className="font-semibold">Λείπουν βάρδιες ανάμεσα στα Ζ:</p>
          <ul className="mt-1 space-y-1" data-testid="z-gaps">
            {zGaps.map((car) => (
              <li key={car.key}>
                <b>{car.label}</b>
                {car.missing.length > 0 && `: ${missingZText(car)}`}
                {car.jumps.map((jump) => (
                  <span key={jump.from} className="block">
                    Μεγάλο κενό {jumpText(jump)}
                  </span>
                ))}
              </li>
            ))}
          </ul>
          <p className="mt-1">Καταχωρήστε τη βάρδια που λείπει ή διορθώστε τον αριθμό Ζ.</p>
        </Notice>
      )}
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">
          {loading ? 'Φόρτωση…' : 'Δεν υπάρχουν βάρδιες για αυτή την περίοδο.'}
        </p>
      ) : (
        <>
          {/* Κινητό: κάρτες */}
          <ul className="space-y-3 md:hidden">
            {visible.map(({ row, figures }) => {
              const driver = driversById.get(row.driver_id);
              return (
                <li
                  key={row.id}
                  className={cx('rounded-xl border p-3', row.id === editingId ? 'border-accent-strong bg-warn-soft' : 'border-line')}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">
                        Ζ {row.z_number} · {driver?.name ?? '—'}
                      </p>
                      <p className="text-xs text-muted">
                        {monthName(row.month)} {row.year}
                        {driver?.plate ? ` · ${driver.plate}` : ''} · {formatDateTime(row.created_at)}
                      </p>
                    </div>
                    <p className="text-right font-bold tabular-nums">{formatEuro(figures.netCashCents)}</p>
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-sm tabular-nums">
                    <dt className="text-muted">Καθαρά</dt>
                    <dd className="text-right">{formatEuro(figures.netRevenueCents)}</dd>
                    <dt className="text-muted">ΦΠΑ 13%</dt>
                    <dd className="text-right">{formatEuro(figures.vatCents)}</dd>
                    <dt className="text-muted">Φιλοδωρήματα</dt>
                    <dd className="text-right">{formatEuro(figures.tipsCents)}</dd>
                    <dt className="text-muted">Έξοδα</dt>
                    <dd className="text-right">{formatEuro(figures.totalExpensesCents)}</dd>
                    <dt className="text-muted">Χλμ (μισθ./σύν.)</dt>
                    <dd className="text-right">
                      {formatKm(figures.paidKm)} / {formatKm(figures.totalKm)}
                    </dd>
                    <dt className="text-muted">Διαδρομές</dt>
                    <dd className="text-right">{figures.trips}</dd>
                  </dl>
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
            <table className="w-full min-w-[60rem] text-sm tabular-nums">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="py-2 pr-3 font-medium">Περίοδος</th>
                  <th className="py-2 pr-3 font-medium">Οδηγός</th>
                  <th className="py-2 pr-3 font-medium">Ζ</th>
                  <th className="py-2 pr-3 text-right font-medium">Διαδρ.</th>
                  <th className="py-2 pr-3 text-right font-medium">Χλμ μισθ./σύν.</th>
                  <th className="py-2 pr-3 text-right font-medium">Καθαρά</th>
                  <th className="py-2 pr-3 text-right font-medium">ΦΠΑ 13%</th>
                  <th className="py-2 pr-3 text-right font-medium">Φιλοδ.</th>
                  <th className="py-2 pr-3 text-right font-medium">Έξοδα</th>
                  <th className="py-2 pr-3 text-right font-medium">Ταμείο</th>
                  <th className="py-2 pr-3 font-medium">Καταχώρηση</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {visible.map(({ row, figures }) => {
                  const driver = driversById.get(row.driver_id);
                  return (
                    <tr key={row.id} className={cx('border-t border-line', row.id === editingId && 'bg-warn-soft')}>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {monthName(row.month)} {row.year}
                      </td>
                      <td className="py-2 pr-3">
                        {driver?.name ?? '—'}
                        {driver?.plate && <span className="block text-xs text-muted">{driver.plate}</span>}
                      </td>
                      <td className="py-2 pr-3">{row.z_number}</td>
                      <td className="py-2 pr-3 text-right">{figures.trips}</td>
                      <td className="py-2 pr-3 text-right whitespace-nowrap">
                        {formatKm(figures.paidKm)} / {formatKm(figures.totalKm)}
                      </td>
                      <td className="py-2 pr-3 text-right whitespace-nowrap">{formatEuro(figures.netRevenueCents)}</td>
                      <td className="py-2 pr-3 text-right whitespace-nowrap">{formatEuro(figures.vatCents)}</td>
                      <td className="py-2 pr-3 text-right whitespace-nowrap">{formatEuro(figures.tipsCents)}</td>
                      <td className="py-2 pr-3 text-right whitespace-nowrap">{formatEuro(figures.totalExpensesCents)}</td>
                      <td className="py-2 pr-3 text-right font-semibold whitespace-nowrap">
                        {formatEuro(figures.netCashCents)}
                      </td>
                      <td className="py-2 pr-3 text-xs whitespace-nowrap text-muted">{formatDateTime(row.created_at)}</td>
                      <td className="py-2 text-right whitespace-nowrap">
                        {canModify(row) && (
                          <>
                            <Button
                              variant="ghost"
                              className="min-h-8 px-2 py-1"
                              onClick={() => onEdit(row)}
                              aria-label={`Επεξεργασία βάρδιας Ζ ${row.z_number}`}
                            >
                              Επεξεργασία
                            </Button>
                            <Button
                              variant="ghost"
                              className="min-h-8 px-2 py-1 text-bad"
                              onClick={() => onDelete(row)}
                              aria-label={`Διαγραφή βάρδιας Ζ ${row.z_number}`}
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

          {items.length > limit && (
            <div className="mt-3 text-center">
              <Button onClick={() => setLimit(items.length)}>Προβολή όλων ({items.length})</Button>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
