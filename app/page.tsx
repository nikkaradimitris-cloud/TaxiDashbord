import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { PendingAccess } from '@/components/PendingAccess';
import { SetupRequired } from '@/components/SetupRequired';
import { SignOutButton } from '@/components/SignOutButton';
import { isMissingSchemaError, isNetworkError } from '@/lib/errors';
import { checkSupabaseConfig } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';

export default async function HomePage() {
  const configProblem = checkSupabaseConfig();
  if (configProblem) return <SetupRequired kind="env" detail={configProblem} />;

  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError && isAuthRetryableFetchError(claimsError)) return <SetupRequired kind="unreachable" />;
  const claims = claimsData?.claims;
  if (!claims?.sub) redirect('/login');
  const userId = claims.sub;

  const [profileResult, driverResult] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
    supabase.from('drivers').select('*').eq('user_id', userId).maybeSingle(),
  ]);

  const failure = profileResult.error ?? driverResult.error;
  if (failure) {
    if (isMissingSchemaError(failure)) return <SetupRequired kind="database" />;
    if (isNetworkError(failure)) return <SetupRequired kind="unreachable" />;
    return <SetupRequired kind="unreachable" detail={failure.message} />;
  }

  const profile = profileResult.data;
  if (!profile) {
    // Ο λογαριασμός διαγράφηκε ενώ η συνεδρία ήταν ακόμη ενεργή.
    return (
      <main className="mx-auto w-full max-w-md px-4 py-16 text-center">
        <p className="mb-4">Ο λογαριασμός δεν βρέθηκε. Συνδεθείτε ξανά.</p>
        <SignOutButton />
      </main>
    );
  }

  const email = profile.email ?? (typeof claims.email === 'string' ? claims.email : '');
  const role = profile.role === 'admin' ? 'admin' : 'driver';
  const ownDriver = driverResult.data;

  if (role === 'driver' && !ownDriver) {
    const { data: adminExists } = await supabase.rpc('admin_exists');
    return <PendingAccess email={email} fullName={profile.full_name} canClaimAdmin={adminExists === false} />;
  }

  return <Dashboard session={{ userId, email, fullName: profile.full_name, role, ownDriver }} />;
}
