'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button, Field, Input, Notice } from '@/components/ui';
import { authErrorMessage } from '@/lib/errors';
import { createClient } from '@/lib/supabase/client';

const MIN_PASSWORD = 8;

export function RegisterForm() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setAlreadyRegistered(false);
    if (password.length < MIN_PASSWORD) {
      setError(`Ο κωδικός πρέπει να έχει τουλάχιστον ${MIN_PASSWORD} χαρακτήρες.`);
      return;
    }
    if (password !== confirm) {
      setError('Οι δύο κωδικοί δεν ταιριάζουν.');
      return;
    }

    setBusy(true);
    const cleanEmail = email.trim().toLowerCase();
    const { data, error: signUpError } = await createClient().auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: { full_name: fullName.trim() },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setBusy(false);

    if (signUpError) {
      setError(authErrorMessage(signUpError));
      setAlreadyRegistered(signUpError.code === 'user_already_exists' || signUpError.code === 'email_exists');
      return;
    }
    if (data.session) {
      // Η επιβεβαίωση email είναι απενεργοποιημένη στο project: είμαστε ήδη μέσα.
      router.replace('/');
      router.refresh();
      return;
    }
    if (data.user && data.user.identities?.length === 0) {
      setError('Υπάρχει ήδη λογαριασμός με αυτό το email.');
      setAlreadyRegistered(true);
      return;
    }
    setSentTo(cleanEmail);
  }

  if (sentTo) {
    return (
      <div className="space-y-4">
        <Notice tone="success">
          Σας στείλαμε email στο <b>{sentTo}</b>. Πατήστε τον σύνδεσμο για να ενεργοποιηθεί ο λογαριασμός σας
          (ελέγξτε και τα ανεπιθύμητα).
        </Notice>
        <p className="text-sm text-muted">
          Μετά την επιβεβαίωση, ο λογαριασμός συνδέεται αυτόματα με τα στοιχεία σας στον στόλο, αρκεί ο ιδιοκτήτης να
          έχει καταχωρίσει το ίδιο email.
        </p>
        <Link href="/login" className="block text-center text-sm font-medium underline">
          Μετάβαση στη σύνδεση
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && (
        <Notice tone="error">
          {error}
          {alreadyRegistered && (
            <span className="mt-1 block">
              <Link href="/login" className="underline">
                Σύνδεση
              </Link>{' '}
              ή{' '}
              <Link href="/forgot-password" className="underline">
                επαναφορά κωδικού
              </Link>
              .
            </span>
          )}
        </Notice>
      )}
      <Field label="Ονοματεπώνυμο">
        <Input autoComplete="name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </Field>
      <Field label="Email" hint="Το ίδιο email που έχει δηλώσει ο ιδιοκτήτης για εσάς.">
        <Input
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <Field label="Κωδικός" hint={`Τουλάχιστον ${MIN_PASSWORD} χαρακτήρες.`}>
        <Input
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      <Field label="Επανάληψη κωδικού">
        <Input
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </Field>
      <Button type="submit" variant="primary" className="w-full" disabled={busy}>
        {busy ? 'Δημιουργία…' : 'Δημιουργία λογαριασμού'}
      </Button>
    </form>
  );
}
