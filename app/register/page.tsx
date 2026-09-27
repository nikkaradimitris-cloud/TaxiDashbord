import Link from 'next/link';
import { AuthShell } from '@/components/auth/AuthShell';
import { RegisterForm } from '@/components/auth/RegisterForm';

export default function RegisterPage() {
  return (
    <AuthShell
      title="Νέος λογαριασμός"
      subtitle="Για οδηγούς του στόλου (και για τον ιδιοκτήτη την πρώτη φορά)."
      footer={
        <p>
          Έχετε ήδη λογαριασμό;{' '}
          <Link href="/login" className="font-medium text-fg underline">
            Σύνδεση
          </Link>
        </p>
      }
    >
      <RegisterForm />
    </AuthShell>
  );
}
