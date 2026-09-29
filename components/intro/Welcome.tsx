'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui';
import { setWelcomeSeen } from '@/lib/storage';
import { CityScene } from './CityScene';
import { INSTALL_TEXT, IOS_STEPS, useInstallState } from './InstallApp';
import { promptInstall } from './install';
import { useReducedMotion } from './motion';

/** Σειρά στοιχείου για τις καθυστερήσεις των κινήσεων (app/intro.css: `var(--i)`). */
const order = (i: number) => ({ '--i': i }) as CSSProperties;

const euro = new Intl.NumberFormat('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Ποσό που «μετράει» από το 0 όταν η κάρτα γίνεται ενεργή. */
function CountUp({ value, active, delay }: { value: number; active: boolean; delay: number }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!active || reduced) return;
    const start = performance.now() + delay;
    let frame = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, Math.max(0, (now - start) / 900));
      setShown(value * (1 - (1 - t) ** 3));
      if (t < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [active, reduced, value, delay]);
  return <>{euro.format(reduced ? value : shown)}</>;
}

function DriverArt({ active }: { active: boolean }) {
  return (
    <div className="intro-driver">
      <div className="intro-receipt">
        <b>Ζ 1024</b>
        {[
          ['Διαδρομές', '14'],
          ['Χιλιόμετρα', '80,5'],
          ['Είσπραξη', '186,23'],
          ['ΦΠΑ 13%', '20,84'],
        ].map(([label, value], i) => (
          <span key={label} style={order(i)}>
            {label} <i>{value}</i>
          </span>
        ))}
        <i className="intro-scan" />
      </div>
      <svg className="intro-flow" viewBox="0 0 34 16">
        <path d="M2 8h28M24 3l6 5-6 5" />
      </svg>
      <div className="intro-result intro-glass">
        Καθαρό ταμείο
        <strong>
          <CountUp value={146.23} active={active} delay={1700} /> €
        </strong>
        <span style={order(0)}>
          Καύσιμα <i>−40,00 €</i>
        </span>
        <span style={order(1)}>
          ΦΠΑ <i>20,84 €</i>
        </span>
      </div>
    </div>
  );
}

// Έξι μήνες τζίρου (ύψος στήλης) και η γραμμή της πορείας πάνω τους.
const BARS = [48, 62, 55, 74, 80, 94];
const TREND = BARS.map((h, i) => [22 + i * 36, 112 - h - 10] as const);

function OwnerArt() {
  return (
    <div className="intro-owner">
      <svg className="intro-chart intro-glass" viewBox="0 0 230 124">
        <defs>
          <linearGradient id="intro-bars" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#6d8ff0" />
            <stop offset="1" stopColor="#4a3aa7" />
          </linearGradient>
        </defs>
        <line className="intro-axis" x1="4" y1="112" x2="226" y2="112" />
        {BARS.map((h, i) => (
          <rect key={i} className="intro-bar" style={order(i)} x={10 + i * 36} y={112 - h} width="24" height={h} rx="4" fill="url(#intro-bars)" />
        ))}
        <path className="intro-trend" d={`M${TREND.map(([x, y]) => `${x} ${y}`).join('L')}`} pathLength={100} />
        {TREND.map(([x, y], i) => (
          <circle key={i} className="intro-trend-dot" style={order(i)} cx={x} cy={y} r="3.2" />
        ))}
      </svg>
      <div className="intro-chips">
        {['Uber', 'FreeNow', 'Bolt', 'ΦΠΑ', 'Excel', 'WhatsApp'].map((chip, i) => (
          <span key={chip} style={order(i)}>
            {chip}
          </span>
        ))}
      </div>
    </div>
  );
}

const PAPERS = [
  { x: '-86px', y: '-34px', r: '-14deg' },
  { x: '84px', y: '-42px', r: '12deg' },
  { x: '-6px', y: '40px', r: '-4deg' },
];

function WhyArt() {
  return (
    <div className="intro-why">
      {PAPERS.map(({ x, y, r }, i) => (
        <i key={i} className="intro-paper" style={{ ...order(i), '--x': x, '--y': y, '--r': r } as CSSProperties} />
      ))}
      <div className="intro-done intro-glass">
        <svg viewBox="0 0 56 56">
          <circle cx="28" cy="28" r="24" strokeOpacity="0.35" />
          <path className="intro-check" d="M17 29l7 7 15-16" pathLength={100} />
        </svg>
        <b>Όλα σε ένα μέρος</b>
      </div>
      <p className="intro-signal intro-glass">
        <svg viewBox="0 0 24 24">
          <path d="M2 20h.01M7 20v-4M12 20v-8M17 20V8M22 4v16" />
        </svg>
        Χωρίς σήμα; Στέλνεται μόλις έρθει
      </p>
    </div>
  );
}

/** Το κουμπί «Εγκατάσταση» (Android) ή τα βήματα για το iPhone· τίποτα αν είναι ήδη εφαρμογή. */
function InstallBox() {
  const state = useInstallState();
  const touch = useSyncExternalStore(
    () => () => {},
    () => window.matchMedia('(pointer: coarse)').matches,
    () => false,
  );
  if (state === 'installed' || (state === 'unknown' && !touch)) return null;
  return (
    <div className="intro-glass intro-fade rounded-2xl p-3 text-sm" style={order(2)} data-testid="welcome-install">
      {state === 'available' ? (
        <>
          <p>{INSTALL_TEXT}</p>
          <button
            type="button"
            onClick={() => promptInstall()}
            className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-white/30 px-4 font-semibold text-white hover:bg-white/10"
          >
            Εγκατάσταση στο κινητό
          </button>
        </>
      ) : (
        <p>
          {state === 'ios'
            ? IOS_STEPS
            : 'Για εικονίδιο στην αρχική οθόνη: μενού του browser (⋮) → «Εγκατάσταση εφαρμογής» ή «Προσθήκη στην αρχική οθόνη».'}
        </p>
      )}
    </div>
  );
}

interface Slide {
  title: string;
  lines: string[];
  art: (active: boolean) => ReactNode;
}

const SLIDES: Slide[] = [
  {
    title: 'Καλώς ήρθατε',
    lines: [
      'Το Taxi Fleet Tracker κρατά βάρδιες, ταμείο και ΦΠΑ του ταξί, σε ένα κινητό.',
      'Για τον ιδιοκτήτη του στόλου και για κάθε οδηγό.',
    ],
    // Νέο «κλειδί» σε κάθε ενεργοποίηση: η διαδρομή ξεκινά από την αρχή.
    art: (active) => <CityScene key={String(active)} mode={active ? 'loop' : 'still'} />,
  },
  {
    title: 'Για τον οδηγό',
    lines: [
      'Γράφει τη βάρδια από το Ζ της ταμειακής σε λίγα δευτερόλεπτα.',
      'Βλέπει αμέσως καθαρά, ΦΠΑ και ταμείο τσέπης.',
    ],
    art: (active) => <DriverArt active={active} />,
  },
  {
    title: 'Για τον ιδιοκτήτη',
    lines: [
      'Όλος ο στόλος με μια ματιά: οδηγοί, αυτοκίνητα, έξοδα, Uber, FreeNow και Bolt.',
      'ΦΠΑ, Excel για τον λογιστή και αποστολή στο WhatsApp.',
    ],
    art: () => <OwnerArt />,
  },
  {
    title: 'Γιατί φτιάχτηκε',
    lines: [
      'Για να μη χάνεται καμία βάρδια και κανένα ευρώ: Ζ, έξοδα και εφαρμογές σε ένα μέρος, αντί για χαρτιά.',
      'Δουλεύει και χωρίς σήμα: η βάρδια στέλνεται μόλις έρθει.',
    ],
    art: () => <WhyArt />,
  },
];

/**
 * «Καλώς ήρθατε»: τέσσερις κάρτες με κινούμενα σχέδια (σύρσιμο ή «Επόμενο»). Βγαίνει μόνη της την
 * πρώτη φορά σε κάθε συσκευή (AppSetup) και ξανά από το «Τι κάνει η εφαρμογή».
 */
export function Welcome({ next }: { next: string }) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const slides = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const last = SLIDES.length - 1;

  function show(index: number) {
    const el = slides.current;
    el?.scrollTo({ left: index * el.clientWidth, behavior: reduced ? 'auto' : 'smooth' });
  }

  function finish() {
    setWelcomeSeen();
    router.replace(next);
  }

  return (
    <main className="intro-welcome intro-dark">
      <div className="intro-dots" />
      <h1 className="sr-only">Taxi Fleet Tracker: τι κάνει η εφαρμογή</h1>
      <header className="relative z-10 flex items-center justify-between gap-3 px-5 pt-4">
        <span className="flex items-center gap-2 font-bold">
          <Logo className="h-8 w-8" />
          Taxi Fleet Tracker
        </span>
        <button type="button" onClick={finish} className="min-h-11 rounded-xl px-3 text-sm text-slate-300 hover:bg-white/10">
          Παράλειψη
        </button>
      </header>

      <div
        ref={slides}
        className="intro-slides"
        onScroll={(event) => {
          const el = event.currentTarget;
          setActive(Math.min(last, Math.max(0, Math.round(el.scrollLeft / el.clientWidth))));
        }}
      >
        {SLIDES.map((slide, i) => (
          <section
            key={slide.title}
            className="intro-slide"
            data-active={i === active}
            aria-roledescription="κάρτα"
            aria-label={`${i + 1} από ${SLIDES.length}: ${slide.title}`}
            inert={i !== active}
          >
            <div className="intro-art">{slide.art(i === active)}</div>
            <h2 className="intro-fade" style={order(0)}>
              {slide.title}
            </h2>
            {slide.lines.map((line, n) => (
              <p key={n} className="intro-fade" style={order(n + 1)}>
                {line}
              </p>
            ))}
            {i === last && <InstallBox />}
          </section>
        ))}
      </div>

      <footer className="relative z-10 mx-auto flex w-full max-w-md flex-col items-center gap-4 px-5 pb-6">
        <div className="flex items-center gap-2">
          {SLIDES.map((slide, i) => (
            <button
              key={slide.title}
              type="button"
              className="grid h-11 place-items-center px-1"
              aria-label={`Κάρτα ${i + 1} από ${SLIDES.length}`}
              aria-current={i === active ? 'step' : undefined}
              onClick={() => show(i)}
            >
              <span className="intro-dot" data-on={i === active} />
            </button>
          ))}
        </div>
        <Button variant="primary" className="w-full text-base" onClick={() => (active < last ? show(active + 1) : finish())}>
          {active < last ? 'Επόμενο' : 'Ξεκινάμε'}
        </Button>
      </footer>
    </main>
  );
}
