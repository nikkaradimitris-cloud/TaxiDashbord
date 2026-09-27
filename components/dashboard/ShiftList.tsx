'use client';

import { useState } from 'react';
import { Button, Card, cx } from '@/components/ui';
import type { ShiftFigures } from '@/lib/accounting';
import { formatDateTime, formatEuro, formatKm } from '@/lib/format';
import { monthName } from '@/lib/period';
import type { DriverRow, ShiftRow } from '@/lib/types';

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
  onDelete,
}: {
  items: { row: ShiftRow; figures: ShiftFigures }[];
  loading: boolean;
  driversById: Map<string, DriverRow>;
  isAdmin: boolean;
  userId: string;
  fetchedAt: number;
  periodText: string;
  onDelete: (row: ShiftRow) => void;
}) {
  const [limit, setLimit] = useState(PAGE);
  const visible = items.slice(0, limit);

  // Ο οδηγός διορθώνει δικές του καταχωρήσεις μόνο μέσα σε 24 ώρες (ο κανόνας ισχύει και στη βάση).
  const canDelete = (row: ShiftRow) =>
    isAdmin || (row.created_by === userId && Date.parse(row.created_at) > fetchedAt - DAY_MS);

  return (
    <Card
      title={`Ιστορικό Βαρδιών · ${periodText}`}
      actions={<span className="text-sm text-muted">{loading ? 'Φόρτωση…' : `${items.length} βάρδιες`}</span>}
      className={cx(loading && 'opacity-60')}
    >
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
                <li key={row.id} className="rounded-xl border border-line p-3">
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
                  {canDelete(row) && (
                    <div className="mt-2 text-right">
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
                    <tr key={row.id} className="border-t border-line">
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
                      <td className="py-2 text-right">
                        {canDelete(row) && (
                          <Button
                            variant="ghost"
                            className="min-h-8 px-2 py-1 text-bad"
                            onClick={() => onDelete(row)}
                            aria-label={`Διαγραφή βάρδιας Ζ ${row.z_number}`}
                          >
                            ✕
                          </Button>
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
    </Card>
  );
}
