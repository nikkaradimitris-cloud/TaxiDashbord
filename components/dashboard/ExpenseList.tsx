'use client';

import { Button, Card, cx } from '@/components/ui';
import type { ExpenseFigures } from '@/lib/accounting';
import { categoryLabel } from '@/lib/expenses';
import { formatDateTime, formatEuro } from '@/lib/format';
import { monthName } from '@/lib/period';
import type { DriverRow, ExpenseRow } from '@/lib/types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Τα έξοδα οχήματος της περιόδου, με σύνολο, διόρθωση και διαγραφή. */
export function ExpenseList({
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
}: {
  items: { row: ExpenseRow; figures: ExpenseFigures }[];
  loading: boolean;
  driversById: Map<string, DriverRow>;
  isAdmin: boolean;
  userId: string;
  fetchedAt: number;
  periodText: string;
  editingId: string | null;
  onEdit: (row: ExpenseRow) => void;
  onDelete: (row: ExpenseRow) => void;
}) {
  // Ο οδηγός διορθώνει/διαγράφει δικές του καταχωρήσεις μόνο μέσα σε 24 ώρες (ο κανόνας ισχύει και στη βάση).
  const canModify = (row: ExpenseRow) =>
    isAdmin || (row.created_by === userId && Date.parse(row.created_at) > fetchedAt - DAY_MS);
  const totalCents = items.reduce((sum, item) => sum + item.figures.amountCents, 0);
  const vatCents = items.reduce((sum, item) => sum + item.figures.vatCents, 0);

  const vehicle = (row: ExpenseRow) => {
    const driver = driversById.get(row.driver_id);
    return { plate: driver?.plate ?? null, name: driver?.name ?? '—' };
  };

  return (
    <Card
      id="expenses"
      title={`Έξοδα Οχήματος · ${periodText}`}
      actions={
        <span className="text-sm text-muted">
          {loading ? 'Φόρτωση…' : items.length === 1 ? '1 έξοδο' : `${items.length} έξοδα`}
        </span>
      }
      className={cx(loading && 'opacity-60')}
    >
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">
          {loading ? 'Φόρτωση…' : 'Δεν υπάρχουν έξοδα οχήματος για αυτή την περίοδο.'}
        </p>
      ) : (
        <>
          {/* Κινητό: κάρτες */}
          <ul className="space-y-3 md:hidden">
            {items.map(({ row, figures }) => {
              const { plate, name } = vehicle(row);
              return (
                <li
                  key={row.id}
                  className={cx('rounded-xl border p-3', row.id === editingId ? 'border-accent-strong bg-warn-soft' : 'border-line')}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold">{categoryLabel(row.category)}</p>
                      {row.description && <p className="text-sm break-words">{row.description}</p>}
                      <p className="text-xs text-muted">
                        {monthName(row.month)} {row.year} · {plate ? `${plate} · ` : ''}
                        {name}
                      </p>
                    </div>
                    <p className="shrink-0 text-right font-bold tabular-nums">
                      {formatEuro(figures.amountCents)}
                      <span className="block text-xs font-normal text-muted">ΦΠΑ {formatEuro(figures.vatCents)}</span>
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
            <table className="w-full min-w-[44rem] text-sm tabular-nums">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="py-2 pr-3 font-medium">Περίοδος</th>
                  <th className="py-2 pr-3 font-medium">Αυτοκίνητο</th>
                  <th className="py-2 pr-3 font-medium">Κατηγορία</th>
                  <th className="py-2 pr-3 font-medium">Περιγραφή</th>
                  <th className="py-2 pr-3 text-right font-medium">Ποσό</th>
                  <th className="py-2 pr-3 text-right font-medium">ΦΠΑ 24%</th>
                  <th className="py-2 pr-3 font-medium">Καταχώρηση</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {items.map(({ row, figures }) => {
                  const { plate, name } = vehicle(row);
                  const label = `${categoryLabel(row.category)} ${formatEuro(figures.amountCents)}`;
                  return (
                    <tr key={row.id} className={cx('border-t border-line', row.id === editingId && 'bg-warn-soft')}>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        {monthName(row.month)} {row.year}
                      </td>
                      <td className="py-2 pr-3">
                        {plate ?? name}
                        {plate && <span className="block text-xs text-muted">{name}</span>}
                      </td>
                      <td className="py-2 pr-3">{categoryLabel(row.category)}</td>
                      <td className="max-w-64 py-2 pr-3 break-words">{row.description || '—'}</td>
                      <td className="py-2 pr-3 text-right font-semibold whitespace-nowrap">
                        {formatEuro(figures.amountCents)}
                      </td>
                      <td className="py-2 pr-3 text-right whitespace-nowrap">{formatEuro(figures.vatCents)}</td>
                      <td className="py-2 pr-3 text-xs whitespace-nowrap text-muted">{formatDateTime(row.created_at)}</td>
                      <td className="py-2 text-right whitespace-nowrap">
                        {canModify(row) && (
                          <>
                            <Button
                              variant="ghost"
                              className="min-h-8 px-2 py-1"
                              onClick={() => onEdit(row)}
                              aria-label={`Επεξεργασία εξόδου ${label}`}
                            >
                              Επεξεργασία
                            </Button>
                            <Button
                              variant="ghost"
                              className="min-h-8 px-2 py-1 text-bad"
                              onClick={() => onDelete(row)}
                              aria-label={`Διαγραφή εξόδου ${label}`}
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

          <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-3 border-t-2 border-line pt-2 text-sm font-semibold tabular-nums">
            <dt>Σύνολο εξόδων οχήματος</dt>
            <dd className="text-right">{formatEuro(totalCents)}</dd>
            <dt className="font-normal text-muted">ΦΠΑ 24% (συμψηφίζεται)</dt>
            <dd className="text-right font-normal text-muted">{formatEuro(vatCents)}</dd>
          </dl>
        </>
      )}
    </Card>
  );
}
