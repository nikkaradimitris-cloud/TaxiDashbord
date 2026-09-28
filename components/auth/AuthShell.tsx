import type { ReactNode } from 'react';
import { Logo } from '@/components/Logo';
import { SetupRequired } from '@/components/SetupRequired';
import { TextSizeToggle } from '@/components/TextSizeToggle';
import { checkSupabaseConfig } from '@/lib/supabase/config';

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const problem = checkSupabaseConfig();
  if (problem) return <SetupRequired kind="env" detail={problem} />;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-6 flex items-center gap-3">
        <Logo className="h-12 w-12 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-xl font-bold">Taxi Fleet Tracker</p>
          <p className="text-sm text-muted">Βάρδιες · ΦΠΑ · Ταμείο</p>
        </div>
        <TextSizeToggle />
      </div>
      <div className="rounded-2xl border border-line bg-card p-5 shadow-sm">
        <h1 className="text-xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        <div className="mt-5">{children}</div>
      </div>
      {footer && <div className="mt-4 space-y-2 text-center text-sm text-muted">{footer}</div>}
    </main>
  );
}
