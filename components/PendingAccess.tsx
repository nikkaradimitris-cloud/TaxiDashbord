'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Logo } from '@/components/Logo';
import { SignOutButton } from '@/components/SignOutButton';
import { TextSizeToggle } from '@/components/TextSizeToggle';
import { Button, Field, Input, Notice, cx } from '@/components/ui';
import { acceptInvite, createFleet } from '@/lib/data';
import { dataErrorMessage } from '@/lib/errors';
import { createClient } from '@/lib/supabase/client';
import type { Invite } from '@/lib/types';

type Choice = 'own' | 'driver';

/** Μεγάλο κουμπί επιλογής· το επιλεγμένο με το κίτρινο των κουμπιών. */
function ChoiceButton({
  selected,
  title,
  text,
  onClick,
}: {
  selected: boolean;
  title: string;
  text: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cx(
        'block w-full rounded-2xl border-2 p-4 text-left transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong',
        selected ? 'border-accent bg-accent text-on-accent shadow-sm' : 'border-line bg-card hover:border-accent-strong',
      )}
    >
      <span className="block text-base font-semibold">{title}</span>
      <span className={cx('mt-1 block text-sm', selected ? 'text-on-accent' : 'text-muted')}>{text}</span>
    </button>
  );
}

/**
 * Συνδεδεμένος χρήστης που δεν ανήκει ακόμη σε στόλο: οι προσκλήσεις ιδιοκτητών για το email του
 * («Αποδοχή») ή «Έχω δικό μου ταξί» (νέος στόλος, με τον ίδιο ιδιοκτήτη).
 */
export function PendingAccess({ email, fullName, invites }: { email: string; fullName: string; invites: Invite[] }) {
  const router = useRouter();
  const [choice, setChoice] = useState<Choice | null>(null);
  const [name, setName] = useState(fullName);
  const [plate, setPlate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept(invite: Invite) {
    setBusy(true);
    setError(null);
    try {
      if (!(await acceptInvite(createClient(), invite.driver_id))) {
        setError('Η πρόσκληση δεν ισχύει πια (ίσως ο ιδιοκτήτης άλλαξε το email). Πατήστε «Ανανέωση».');
        setBusy(false);
        return;
      }
      router.refresh();
    } catch (err) {
      setError(dataErrorMessage(err));
      setBusy(false);
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setError('Γράψτε το όνομά σας.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createFleet(createClient(), { name, plate });
      router.refresh();
    } catch (err) {
      setError(dataErrorMessage(err));
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-10">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Logo className="h-10 w-10 shrink-0" />
          <p className="text-xl font-bold">Taxi Fleet Tracker</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <TextSizeToggle />
          <SignOutButton className="px-3" />
        </div>
      </div>

      <div className="space-y-5 rounded-2xl border border-line bg-card p-5 shadow-sm">
        <div>
          <h1 className="text-xl font-semibold">Γεια σας{fullName ? `, ${fullName}` : ''}!</h1>
          <p className="mt-1 text-sm leading-6">
            Ο λογαριασμός <b>{email}</b> είναι ενεργός.
          </p>
        </div>

        {invites.length > 0 && (
          <section className="space-y-3" aria-labelledby="invites-title">
            <h2 id="invites-title" className="text-lg font-semibold">
              {invites.length === 1 ? 'Έχετε πρόσκληση' : 'Έχετε προσκλήσεις'}
            </h2>
            <ul className="space-y-3">
              {invites.map((invite) => (
                <li key={invite.driver_id} className="rounded-xl border border-line p-4" data-testid="invite">
                  <p className="text-sm leading-6">
                    <b>{invite.fleet_name}</b> <span className="text-muted">({invite.owner_email})</span> σας πρόσθεσε
                    ως οδηγό στο αυτοκίνητο:
                  </p>
                  <p className="mt-1 font-semibold">
                    {invite.plate ? `${invite.plate} · ` : ''}
                    {invite.driver_name}
                  </p>
                  <Button variant="primary" className="mt-3 w-full" onClick={() => accept(invite)} disabled={busy}>
                    Αποδοχή
                  </Button>
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted">
              Με την «Αποδοχή» ο ιδιοκτήτης βλέπει ό,τι καταχωρείτε για αυτό το αυτοκίνητο. Εσείς βλέπετε μόνο τα
              δικά σας.
            </p>
          </section>
        )}

        <section className="space-y-3" aria-labelledby="choice-title">
          <h2 id="choice-title" className="text-lg font-semibold">
            {invites.length > 0 ? 'Ή αλλιώς' : 'Πώς θα χρησιμοποιήσετε την εφαρμογή;'}
          </h2>
          <ChoiceButton
            selected={choice === 'own'}
            title="Έχω δικό μου ταξί"
            text="Γράφω τις βάρδιες του ταξί μου. Αν έχω οδηγούς, τους προσθέτω."
            onClick={() => {
              setChoice('own');
              setError(null);
            }}
          />
          <ChoiceButton
            selected={choice === 'driver'}
            title="Οδηγώ ταξί άλλου"
            text="Ο ιδιοκτήτης με προσθέτει με το email μου."
            onClick={() => {
              setChoice('driver');
              setError(null);
            }}
          />
        </section>

        {choice === 'own' && (
          <form id="create-fleet" onSubmit={handleCreate} className="space-y-3 rounded-xl border border-line p-4">
            <Field label="Το όνομά σας" hint="Έτσι φαίνεται στις βάρδιες και στις προσκλήσεις προς τους οδηγούς σας.">
              <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={100} />
            </Field>
            <Field label="Πινακίδα ταξί" hint="Προαιρετικό">
              <Input
                value={plate}
                placeholder="π.χ. ΤΑΧ-1234"
                onChange={(e) => setPlate(e.target.value)}
                autoComplete="off"
                maxLength={20}
              />
            </Field>
            <Button type="submit" variant="primary" className="w-full" disabled={busy}>
              {busy ? 'Δημιουργία…' : 'Δημιουργία'}
            </Button>
            <p className="text-sm text-muted">
              Τα στοιχεία σας τα βλέπετε μόνο εσείς. Αν προσθέσετε οδηγούς, ο καθένας βλέπει μόνο τα δικά του.
            </p>
          </form>
        )}

        {choice === 'driver' && (
          <div className="space-y-3 rounded-xl border border-line p-4">
            <p className="text-sm leading-6">
              Ζητήστε από τον ιδιοκτήτη να σας προσθέσει στην «Υποδομή Στόλου» με το email σας: <b>{email}</b>. Μετά
              πατήστε «Ανανέωση» και «Αποδοχή».
            </p>
            <Button variant="primary" className="w-full" onClick={() => router.refresh()} disabled={busy}>
              Ανανέωση
            </Button>
          </div>
        )}

        {error && <Notice tone="error">{error}</Notice>}
      </div>
    </main>
  );
}
