import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { TEXT_SIZE_KEY } from '@/lib/storage';
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

// Τα μεγάλα γράμματα («Α+») εφαρμόζονται πριν εμφανιστεί η σελίδα, ώστε να μη «πηδάει».
const textSizeScript = `try{if(JSON.parse(localStorage.getItem(${JSON.stringify(TEXT_SIZE_KEY)}))==='large')document.documentElement.dataset.textSize='large'}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="el" suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        <Script id="text-size" strategy="beforeInteractive">
          {textSizeScript}
        </Script>
        {children}
      </body>
    </html>
  );
}
