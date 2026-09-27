import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Taxi Fleet Tracker',
  description: 'Βάρδιες, ΦΠΑ και ταμείο για στόλο ταξί — για ιδιοκτήτες και οδηγούς.',
  applicationName: 'Taxi Fleet Tracker',
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: 'Taxi Fleet', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f3f4f6' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0f19' },
  ],
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="el">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
