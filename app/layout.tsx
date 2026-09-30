import type { Metadata, Viewport } from 'next';
import { AppSetup } from '@/components/intro/AppSetup';
import { ROUTES, SPLASH_TIPS } from '@/components/intro/scenes';
import { Splash } from '@/components/intro/Splash';
import { SPLASH_KEY, SPLASH_TIP_KEY, TEXT_SIZE_KEY, WELCOME_KEY } from '@/lib/storage';
import './globals.css';
import './intro.css';
import './utilization.css';

export const metadata: Metadata = {
  title: 'Taxi Fleet Tracker',
  description: 'Βάρδιες, ΦΠΑ και ταμείο για στόλο ταξί — για ιδιοκτήτες και οδηγούς.',
  applicationName: 'Taxi Fleet Tracker',
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: 'Taxi Fleet', statusBarStyle: 'default' },
  // Προεπισκόπηση όταν στέλνεται ο σύνδεσμος (WhatsApp κ.λπ.)· η εικόνα είναι το app/opengraph-image.png.
  openGraph: {
    title: 'Taxi Fleet Tracker',
    description: 'Βάρδιες ταξί από το Ζ, αξιοποίηση χιλιομέτρων και ΦΠΑ του μήνα: Χρεωστικό ή Πιστωτικό.',
    siteName: 'Taxi Fleet Tracker',
    locale: 'el_GR',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f3f4f6' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0f19' },
  ],
};

// Πριν εμφανιστεί η σελίδα, ώστε να μη «πηδάει»: τα μεγάλα γράμματα («Α+»), η κίνηση ανοίγματος μόνο
// μία φορά σε κάθε άνοιγμα (και, αφού έχει φανεί το «Καλώς ήρθατε», κάθε φορά το επόμενο μήνυμα και η
// επόμενη διαδρομή), και το «beforeinstallprompt» (κουμπί «Εγκατάσταση»), που μπορεί να έρθει πριν
// φορτώσει η εφαρμογή (components/intro/install.ts). Απλό <script> στο <head>, που τρέχει όσο διαβάζεται
// η σελίδα (οδηγός Next.js «Preventing flash before hydration»)· το <Script beforeInteractive> περιμένει
// να φορτώσει ο κώδικας του Next.js, άρα μπορεί να έρθει μετά την πρώτη εικόνα.
const [splash, welcome, tip] = [SPLASH_KEY, WELCOME_KEY, SPLASH_TIP_KEY].map((key) => JSON.stringify(key));
const bootScript = [
  `try{if(JSON.parse(localStorage.getItem(${JSON.stringify(TEXT_SIZE_KEY)}))==='large')document.documentElement.dataset.textSize='large'}catch(e){}`,
  `try{var d=document.documentElement;if(sessionStorage.getItem(${splash}))d.dataset.splash='done';else{sessionStorage.setItem(${splash},'1');if(localStorage.getItem(${welcome})!==null){var n=Number(localStorage.getItem(${tip}))||0;d.dataset.tip=String(n%${SPLASH_TIPS.length});d.dataset.route=String(n%${ROUTES.length});localStorage.setItem(${tip},String(n+1))}}}catch(e){document.documentElement.dataset.splash='done'}`,
  `addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__taxiInstallPrompt=e})`,
].join(';');

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="el" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
      </head>
      <body className="min-h-dvh antialiased">
        <Splash />
        <AppSetup />
        {children}
      </body>
    </html>
  );
}
