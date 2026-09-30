import Link from 'next/link';
import { AuthShell } from '@/components/auth/AuthShell';
import { RegisterForm } from '@/components/auth/RegisterForm';
import { DISCLAIMER } from '@/lib/disclaimer';

export default function RegisterPage() {
  return (
    <AuthShell
      title="Νέος λογαριασμός"
      subtitle="Για ιδιοκτήτες με δικό τους ταξί και για οδηγούς."
      footer={
        <>
          <p>
            Έχετε ήδη λογαριασμό;{' '}
            <Link href="/login" className="font-medium text-fg underline">
              Σύνδεση
            </Link>
          </p>
          <p className="text-xs" data-testid="disclaimer">
            {DISCLAIMER}
          </p>
        </>
      }
    >
      <RegisterForm />
    </AuthShell>
  );
}
