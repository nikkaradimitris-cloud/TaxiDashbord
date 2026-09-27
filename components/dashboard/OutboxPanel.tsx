'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { periodLabel } from '@/lib/period';
import type { PendingShift } from '@/lib/storage';

/** Βάρδιες που καταχωρήθηκαν χωρίς σήμα και περιμένουν αποστολή. */
export function OutboxPanel({
  items,
  onSend,
  onDiscard,
}: {
  items: PendingShift[];
  onSend: () => Promise<void>;
  onDiscard: (id: string) => void;
}) {
  const [sending, setSending] = useState(false);
  if (items.length === 0) return null;

  async function send() {
    setSending(true);
    try {
      await onSend();
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="rounded-2xl border border-warn/40 bg-warn-soft p-4 text-warn">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-semibold">
          {items.length === 1 ? '1 βάρδια περιμένει' : `${items.length} βάρδιες περιμένουν`} αποστολή (χωρίς σύνδεση)
        </p>
        <Button variant="primary" onClick={send} disabled={sending}>
          {sending ? 'Αποστολή…' : 'Αποστολή τώρα'}
        </Button>
      </div>
      <ul className="mt-2 space-y-1 text-sm">
        {items.map((item) => (
          <li key={item.payload.id} className="flex flex-wrap items-center justify-between gap-2">
            <span>
              Ζ {item.payload.z_number} · {item.driverName} · {periodLabel(item.payload.year, item.payload.month)} ·
              καταχωρήθηκε {formatDateTime(item.savedAt)}
              {item.lastError && <span className="block font-semibold">Σφάλμα: {item.lastError}</span>}
            </span>
            {item.lastError && (
              <button
                type="button"
                className="underline"
                onClick={() => confirm('Να απορριφθεί αυτή η βάρδια;') && onDiscard(item.payload.id)}
              >
                Απόρριψη
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
