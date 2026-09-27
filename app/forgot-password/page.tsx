import Link from 'next/link';
import { AuthShell } from '@/components/auth/AuthShell';
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';

export default async function ForgotPasswordPage({ searchParams }: PageProps<'/forgot-password'>) {
  const { error } = await searchParams;
  const initialError =
    error === 'link' ? 'Ο σύνδεσμος έληξε ή άνοιξε σε άλλη συσκευή. Ζητήστε νέο από εδώ.' : undefined;

  return (
    <AuthShell
      title="Επαναφορά κωδικού"
      subtitle="Θα σας στείλουμε σύνδεσμο για να ορίσετε νέο κωδικό."
      footer={
        <p>
          <Link href="/login" className="underline">
            Επιστροφή στη σύνδεση
          </Link>
        </p>
      }
    >
      <ForgotPasswordForm initialError={initialError} />
    </AuthShell>
  );
}
