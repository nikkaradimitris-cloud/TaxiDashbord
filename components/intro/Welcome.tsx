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
const decimal1 = new Intl.NumberFormat('el-GR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Αριθμός που «μετράει» από το 0 όταν η κάρτα γίνεται ενεργή. */
function CountUp({
  value,
  active,
  delay,
  format = euro,
}: {
  value: number;
  active: boolean;
  delay: number;
  format?: Intl.NumberFormat;
}) {
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
  return <>{format.format(reduced ? value : shown)}</>;
}

// Η βάρδια του παραδείγματος (Ζ 1024): 80,5 μισθωμένα και 40 ελεύθερα χλμ, καθαρά 160,39 €.
const KM_PAID = 80.5;
const KM_EMPTY = 40;
const KM_PCT = (KM_PAID / (KM_PAID + KM_EMPTY)) * 100; // 66,8%· έσοδο ανά χλμ 160,39 / 120,5 = 1,33 €

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
        Καθαρά έσοδα
        <strong>
          <CountUp value={160.39} active={active} delay={1700} /> €
        </strong>
        <span style={order(0)}>
          ΦΠΑ 13% <i>20,84 €</i>
        </span>
        <span style={order(1)}>
          Αξιοποίηση <i>{decimal1.format(KM_PCT)}%</i>
        </span>
      </div>
    </div>
  );
}

function KmArt({ active }: { active: boolean }) {
  return (
    <div className="intro-km">
      <div className="intro-gauge">
        <svg viewBox="0 0 120 120">
          <circle className="intro-gauge-track" cx="60" cy="60" r="50" />
          <circle
            className="intro-gauge-fill"
            cx="60"
            cy="60"
            r="50"
            pathLength={100}
            style={{ '--pct': KM_PCT.toFixed(1) } as CSSProperties}
          />
        </svg>
        <p>
          <strong>
            <CountUp value={KM_PCT} active={active} delay={300} format={decimal1} />%
          </strong>
          αξιοποίηση
        </p>
      </div>
      <div className="intro-km-legend intro-glass">
        <span style={order(0)}>
          <i className="intro-key" data-kind="paid" />
          Μισθωμένα <b>{decimal1.format(KM_PAID)} χλμ</b>
        </span>
        <span style={order(1)}>
          <i className="intro-key" data-kind="empty" />
          Ελεύθερα <b>{decimal1.format(KM_EMPTY)} χλμ</b>
        </span>
        <span style={order(2)}>
          Έσοδο ανά χλμ <b>1,33 €</b>
        </span>
      </div>
    </div>
  );
}

// ΦΠΑ ενός μήνα (παράδειγμα): των εσόδων από τα Ζ μείον των εξόδων (καύσιμα, επισκευές, προμήθειες με ΦΠΑ).
const VAT_IN = 452.86;
const VAT_OUT = 297.43;

function VatArt({ active }: { active: boolean }) {
  return (
    <div className="intro-vat">
      <div className="intro-vat-sources">
        {['Ζ βαρδιών', 'Έξοδα', 'Τιμολόγια εφαρμογών'].map((source, i) => (
          <span key={source} style={order(i)}>
            {source}
          </span>
        ))}
      </div>
      <div className="intro-vat-card intro-glass">
        <p className="intro-vat-title">Προς Απόδοση ΦΠΑ · Σεπτέμβριος</p>
        <p style={order(0)}>
          ΦΠΑ εσόδων 13% <b>+ {euro.format(VAT_IN)} €</b>
        </p>
        <p style={order(1)}>
          ΦΠΑ εξόδων 24% <b>− {euro.format(VAT_OUT)} €</b>
        </p>
        <strong className="intro-vat-total">
          <CountUp value={VAT_IN - VAT_OUT} active={active} delay={1300} /> €
        </strong>
        <span className="intro-vat-status">Χρεωστικό — προς πληρωμή</span>
        <span className="intro-vat-send">Για τον λογιστή: Excel · WhatsApp</span>
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
      'Το Taxi Fleet Tracker κρατά βάρδιες, χιλιόμετρα, έξοδα και τον ΦΠΑ του ταξί, σε ένα κινητό.',
      'Για τον ιδιοκτήτη του στόλου και για κάθε οδηγό.',
    ],
    // Νέο «κλειδί» σε κάθε ενεργοποίηση: η διαδρομή ξεκινά από την αρχή.
    art: (active) => <CityScene key={String(active)} mode={active ? 'loop' : 'still'} />,
  },
  {
    title: 'Για τον οδηγό',
    lines: [
      'Γράφει τη βάρδια από το Ζ της ταμειακής σε λίγα δευτερόλεπτα.',
      'Βλέπει αμέσως τα έσοδα, τον ΦΠΑ της βάρδιας και την αξιοποίηση των χιλιομέτρων.',
    ],
    art: (active) => <DriverArt active={active} />,
  },
  {
    title: 'Αξιοποίηση χιλιομέτρων',
    lines: [
      'Από τα μισθωμένα και τα ελεύθερα χιλιόμετρα κάθε βάρδιας φαίνεται πόσο δουλεύει το αυτοκίνητο με πελάτη.',
      'Αξιοποίηση % και έσοδο ανά χιλιόμετρο, για κάθε οδηγό και μήνα.',
    ],
    art: (active) => <KmArt active={active} />,
  },
  {
    title: 'ΦΠΑ στο τέλος του μήνα',
    lines: [
      'Από τα Ζ, τα έξοδα και τα τιμολόγια των εφαρμογών (Uber, FreeNow, Bolt) βγαίνει ο ΦΠΑ του μήνα: Χρεωστικός ή Πιστωτικός.',
      'Για κάθε οδηγό και για όλο τον στόλο, έτοιμος για τον λογιστή σε Excel και στο WhatsApp.',
    ],
    art: (active) => <VatArt active={active} />,
  },
  {
    title: 'Γιατί φτιάχτηκε',
    lines: [
      'Για να βγαίνει σωστός ο ΦΠΑ του μήνα και να μη χάνεται καμία βάρδια: Ζ, έξοδα και τιμολόγια εφαρμογών σε ένα μέρος, αντί για χαρτιά.',
      'Δουλεύει και χωρίς σήμα: η βάρδια στέλνεται μόλις έρθει.',
    ],
    art: () => <WhyArt />,
  },
];

/**
 * «Καλώς ήρθατε»: πέντε κάρτες με κινούμενα σχέδια (σύρσιμο ή «Επόμενο»). Βγαίνει μόνη της την
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
