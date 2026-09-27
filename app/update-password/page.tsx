import { AuthShell } from '@/components/auth/AuthShell';
import { UpdatePasswordForm } from '@/components/auth/UpdatePasswordForm';

export default function UpdatePasswordPage() {
  return (
    <AuthShell title="Νέος κωδικός" subtitle="Ορίστε τον νέο κωδικό του λογαριασμού σας.">
      <UpdatePasswordForm />
    </AuthShell>
  );
}
