'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Logo } from '@/components/Logo';
import { SignOutButton } from '@/components/SignOutButton';
import { Button, Notice } from '@/components/ui';
import { dataErrorMessage } from '@/lib/errors';
import { createClient } from '@/lib/supabase/client';

/** Συνδεδεμένος χρήστης που δεν έχει ακόμη αντιστοιχιστεί σε οδηγό του στόλου. */
export function PendingAccess({
  email,
  fullName,
  canClaimAdmin,
}: {
  email: string;
  fullName: string;
  canClaimAdmin: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function claimAdmin() {
    if (!confirm('Θα γίνετε ο Διαχειριστής (ιδιοκτήτης) με πλήρη πρόσβαση σε όλα τα στοιχεία. Συνέχεια;')) return;
    setBusy(true);
    setError(null);
    const { data, error: rpcError } = await createClient().rpc('claim_admin');
    if (rpcError) {
      setError(dataErrorMessage(rpcError));
      setBusy(false);
      return;
    }
    if (!data) setError('Υπάρχει ήδη Διαχειριστής. Ζητήστε του να σας προσθέσει στον στόλο.');
    setBusy(false);
    router.refresh();
  }

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-10">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Logo />
          <p className="text-xl font-bold">Taxi Fleet Tracker</p>
        </div>
        <SignOutButton />
      </div>

      <div className="space-y-4 rounded-2xl border border-line bg-card p-5 shadow-sm">
        <h1 className="text-xl font-semibold">Γεια σας{fullName ? `, ${fullName}` : ''}!</h1>
        <p className="text-sm leading-6">
          Ο λογαριασμός <b>{email}</b> είναι ενεργός, αλλά δεν έχει αντιστοιχιστεί ακόμη σε οδηγό του στόλου.
        </p>
        <p className="text-sm leading-6 text-muted">
          Ζητήστε από τον ιδιοκτήτη να προσθέσει αυτό το email στα στοιχεία σας (Υποδομή Στόλου). Μόλις το κάνει,
          πατήστε «Ανανέωση».
        </p>
        {error && <Notice tone="error">{error}</Notice>}
        <Button variant="primary" className="w-full" onClick={() => router.refresh()}>
          Ανανέωση
        </Button>

        {canClaimAdmin && (
          <div className="rounded-xl border border-dashed border-accent-strong p-4">
            <p className="text-sm font-semibold">Πρώτη ρύθμιση: δεν υπάρχει ακόμη Διαχειριστής.</p>
            <p className="mt-1 text-sm text-muted">
              Αν είστε ο ιδιοκτήτης του στόλου, ενεργοποιήστε τον λογαριασμό σας ως Διαχειριστή. Αυτό γίνεται μόνο
              μία φορά.
            </p>
            <Button className="mt-3 w-full" onClick={claimAdmin} disabled={busy}>
              Είμαι ο ιδιοκτήτης — ενεργοποίηση ως Διαχειριστής
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
