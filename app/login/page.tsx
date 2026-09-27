import Link from 'next/link';
import { AuthShell } from '@/components/auth/AuthShell';
import { LoginForm } from '@/components/auth/LoginForm';

const MESSAGES: Record<string, string> = {
  confirmed: 'Το email σας επιβεβαιώθηκε. Συνδεθείτε με τον κωδικό σας.',
};

const ERRORS: Record<string, string> = {
  link: 'Ο σύνδεσμος δεν είναι έγκυρος ή έχει λήξει. Συνδεθείτε ή ζητήστε νέο.',
};

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const { message, error } = await searchParams;
  const initialMessage =
    typeof error === 'string' && ERRORS[error]
      ? { tone: 'error' as const, text: ERRORS[error] }
      : typeof message === 'string' && MESSAGES[message]
        ? { tone: 'success' as const, text: MESSAGES[message] }
        : undefined;

  return (
    <AuthShell
      title="Σύνδεση"
      subtitle="Ιδιοκτήτες και οδηγοί συνδέονται με το δικό τους email."
      footer={
        <>
          <p>
            Νέος οδηγός;{' '}
            <Link href="/register" className="font-medium text-fg underline">
              Δημιουργία λογαριασμού
            </Link>
          </p>
          <p>
            <Link href="/forgot-password" className="underline">
              Ξεχάσατε τον κωδικό;
            </Link>
          </p>
        </>
      }
    >
      <LoginForm initialMessage={initialMessage} />
    </AuthShell>
  );
}
