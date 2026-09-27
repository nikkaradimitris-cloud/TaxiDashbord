import { Logo } from './Logo';

type Kind = 'env' | 'database' | 'unreachable';

const TITLES: Record<Kind, string> = {
  env: 'Χρειάζεται σύνδεση με το Supabase',
  database: 'Η βάση δεδομένων δεν έχει ρυθμιστεί',
  unreachable: 'Δεν υπάρχει επικοινωνία με το Supabase',
};

/** Οδηγίες αντί για "σπασμένη" σελίδα όταν λείπει κάποια ρύθμιση. */
export function SetupRequired({ kind = 'env', detail }: { kind?: Kind; detail?: string | null }) {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <div className="mb-6 flex items-center gap-3">
        <Logo />
        <p className="text-xl font-bold">Taxi Fleet Tracker</p>
      </div>
      <div className="rounded-2xl border border-line bg-card p-5 shadow-sm">
        <h1 className="text-xl font-semibold">{TITLES[kind]}</h1>
        {detail && <p className="mt-2 rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">{detail}</p>}

        {kind === 'env' && (
          <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-6">
            <li>
              Στο Supabase ανοίξτε <b>Project Settings → API Keys</b> και αντιγράψτε το <b>Project URL</b> και το{' '}
              <b>publishable key</b> (ή το παλιό <b>anon</b> key).
            </li>
            <li>
              Τοπικά: δημιουργήστε αρχείο <code>.env.local</code> (δείτε το <code>.env.example</code>). Στο Vercel:{' '}
              <b>Settings → Environment Variables</b>.
              <pre className="mt-2 overflow-x-auto rounded-xl bg-bg p-3 text-xs">
                {'NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...'}
              </pre>
            </li>
            <li>
              Επανεκκινήστε την εφαρμογή (<code>npm run dev</code>) ή κάντε <b>Redeploy</b> στο Vercel.
            </li>
          </ol>
        )}

        {kind === 'database' && (
          <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-6">
            <li>
              Ανοίξτε το αρχείο <code>supabase/migrations/20260927120000_taxi_fleet.sql</code> του project.
            </li>
            <li>
              Στο Supabase: <b>SQL Editor → New query</b>, επικολλήστε ολόκληρο το αρχείο και πατήστε <b>Run</b>.
            </li>
            <li>Ανανεώστε αυτή τη σελίδα.</li>
          </ol>
        )}

        {kind === 'unreachable' && (
          <ul className="mt-4 list-disc space-y-3 pl-5 text-sm leading-6">
            <li>Ελέγξτε τη σύνδεση στο internet.</li>
            <li>
              Τα δωρεάν projects του Supabase <b>μπαίνουν σε παύση</b> μετά από μέρες αδράνειας. Ανοίξτε το project στο
              supabase.com και πατήστε <b>Restore project</b>.
            </li>
            <li>Βεβαιωθείτε ότι το NEXT_PUBLIC_SUPABASE_URL είναι σωστό.</li>
          </ul>
        )}

        <p className="mt-5 text-sm text-muted">Αναλυτικές οδηγίες υπάρχουν στο README.md του project.</p>
      </div>
    </main>
  );
}
