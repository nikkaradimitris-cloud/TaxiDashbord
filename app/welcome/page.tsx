import type { Metadata } from 'next';
import { Welcome } from '@/components/intro/Welcome';

export const metadata: Metadata = { title: 'Καλώς ήρθατε · Taxi Fleet Tracker' };

/** «Καλώς ήρθατε»: ανοίγει χωρίς σύνδεση· μετά το «Ξεκινάμε» πηγαίνει στο `next` (μόνο σελίδες της εφαρμογής). */
export default async function WelcomePage({ searchParams }: PageProps<'/welcome'>) {
  const { next } = await searchParams;
  const safeNext = typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : '/';
  return <Welcome next={safeNext} />;
}
