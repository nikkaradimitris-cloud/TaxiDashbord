'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button, Field, Input, Notice } from '@/components/ui';
import { authErrorMessage } from '@/lib/errors';
import { createClient } from '@/lib/supabase/client';

const MIN_PASSWORD = 8;

export function UpdatePasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD) {
      setError(`Ο κωδικός πρέπει να έχει τουλάχιστον ${MIN_PASSWORD} χαρακτήρες.`);
      return;
    }
    if (password !== confirm) {
      setError('Οι δύο κωδικοί δεν ταιριάζουν.');
      return;
    }
    setBusy(true);
    const { error: updateError } = await createClient().auth.updateUser({ password });
    if (updateError) {
      setError(authErrorMessage(updateError));
      setBusy(false);
      return;
    }
    router.replace('/');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <Notice tone="error">{error}</Notice>}
      <Field label="Νέος κωδικός" hint={`Τουλάχιστον ${MIN_PASSWORD} χαρακτήρες.`}>
        <Input
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      <Field label="Επανάληψη νέου κωδικού">
        <Input
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </Field>
      <Button type="submit" variant="primary" className="w-full" disabled={busy}>
        {busy ? 'Αποθήκευση…' : 'Αποθήκευση κωδικού'}
      </Button>
    </form>
  );
}
