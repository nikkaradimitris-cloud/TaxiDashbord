'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button, Field, Input, Notice } from '@/components/ui';
import { authErrorMessage } from '@/lib/errors';
import { createClient } from '@/lib/supabase/client';

type Message = { tone: 'success' | 'error'; text: string };

export function LoginForm({ initialMessage }: { initialMessage?: Message }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(initialMessage ?? null);
  const [unconfirmed, setUnconfirmed] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setUnconfirmed(false);

    const { error } = await createClient().auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      setMessage({ tone: 'error', text: authErrorMessage(error) });
      setUnconfirmed(error.code === 'email_not_confirmed' || /not confirmed/i.test(error.message));
      setBusy(false);
      return;
    }
    router.replace('/');
    router.refresh();
  }

  async function resendConfirmation() {
    setBusy(true);
    const { error } = await createClient().auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setMessage(
      error
        ? { tone: 'error', text: authErrorMessage(error) }
        : { tone: 'success', text: 'Στάλθηκε νέο email επιβεβαίωσης. Ελέγξτε και τα ανεπιθύμητα (spam).' },
    );
    setUnconfirmed(false);
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
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
      <Field label="Κωδικός">
        <Input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      <Button type="submit" variant="primary" className="w-full" disabled={busy}>
        {busy ? 'Σύνδεση…' : 'Σύνδεση'}
      </Button>
      {unconfirmed && (
        <Button className="w-full" onClick={resendConfirmation} disabled={busy || !email}>
          Αποστολή ξανά του email επιβεβαίωσης
        </Button>
      )}
    </form>
  );
}
