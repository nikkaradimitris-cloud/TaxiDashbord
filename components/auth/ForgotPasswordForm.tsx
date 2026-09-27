'use client';

import { useState, type FormEvent } from 'react';
import { Button, Field, Input, Notice } from '@/components/ui';
import { authErrorMessage } from '@/lib/errors';
import { createClient } from '@/lib/supabase/client';

export function ForgotPasswordForm({ initialError }: { initialError?: string }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error: resetError } = await createClient().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/update-password`,
    });
    setBusy(false);
    if (resetError) {
      setError(authErrorMessage(resetError));
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <Notice tone="success">
        Αν υπάρχει λογαριασμός με το email <b>{email.trim()}</b>, θα λάβετε σύνδεσμο για νέο κωδικό. Ανοίξτε τον από
        αυτή τη συσκευή.
      </Notice>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <Notice tone="error">{error}</Notice>}
      <Field label="Email">
        <Input
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <Button type="submit" variant="primary" className="w-full" disabled={busy}>
        {busy ? 'Αποστολή…' : 'Αποστολή συνδέσμου'}
      </Button>
    </form>
  );
}
