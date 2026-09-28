'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';

export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    await createClient().auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <Button variant="ghost" onClick={signOut} disabled={busy} className={className}>
      {busy ? (
        'Έξοδος…'
      ) : (
        <>
          {/* Στο κινητό πιο σύντομο, ώστε να χωράει ο τίτλος με μεγάλα γράμματα. */}
          <span className="sm:hidden">Έξοδος</span>
          <span className="hidden sm:inline">Αποσύνδεση</span>
        </>
      )}
    </Button>
  );
}
