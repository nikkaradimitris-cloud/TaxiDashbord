'use client';

import { useId } from 'react';
import { useReducedMotion } from './motion';
import { ROUTES } from './scenes';

// Τετράγωνα 36×26 με δρόμους 8 ανάμεσα, στο κέντρο του χάρτη 200×140.
const BLOCKS = [16, 60, 104, 148].flatMap((x) => [6, 40, 74, 108].map((y) => [x, y] as const));
const SPLINE = '0.5 0.05 0.25 1';

type Mode = 'once' | 'loop' | 'still';

function Route({ route, id, scene, variant }: { route: (typeof ROUTES)[number]; id: string; scene: Mode; variant?: number }) {
  const [sx, sy] = route.start;
  const [ex, ey] = route.end;
  return (
    <g className="intro-route-set" data-route={variant}>
      <path className="intro-route-glow" d={route.d} pathLength={100} />
      <path id={id} className="intro-route" d={route.d} pathLength={100} />
      <circle className="intro-pin" cx={sx} cy={sy} r="3.2" />
      <circle className="intro-ping" cx={ex} cy={ey} r="3.2" />
      <circle className="intro-pin" cx={ex} cy={ey} r="3.2" />
      <g transform={scene === 'still' ? `translate(${ex} ${ey})` : undefined}>
        <circle className="intro-taxi-halo" r="7" />
        <circle className="intro-taxi-dot" r="3.6" />
        {scene === 'once' && (
          <animateMotion dur="0.95s" fill="freeze" calcMode="spline" keyTimes="0;1" keyPoints="0;1" keySplines={SPLINE}>
            <mpath href={`#${id}`} />
          </animateMotion>
        )}
        {scene === 'loop' && (
          <>
            <animateMotion
              dur="3.2s"
              repeatCount="indefinite"
              calcMode="spline"
              keyTimes="0;0.55;1"
              keyPoints="0;1;1"
              keySplines={`${SPLINE};0 0 1 1`}
            >
              <mpath href={`#${id}`} />
            </animateMotion>
            <animate attributeName="opacity" dur="3.2s" repeatCount="indefinite" values="1;1;0" keyTimes="0;0.85;1" />
          </>
        )}
      </g>
    </g>
  );
}

/**
 * Πόλη τη νύχτα: μια διαδρομή ζωγραφίζεται πάνω στους δρόμους και το ταξί την ακολουθεί.
 * `once`: μία φορά (κίνηση ανοίγματος)· `loop`: ξανά και ξανά· `still`: ακίνητη, τελική εικόνα.
 * Με `variants` υπάρχουν όλες οι διαδρομές και φαίνεται αυτή που διάλεξε το app/layout.tsx
 * (`data-route` στο <html>)· αλλιώς η πρώτη.
 */
export function CityScene({ mode, variants = false }: { mode: Mode; variants?: boolean }) {
  const routeId = `intro-route-${useId().replace(/[^\w-]/g, '')}`;
  const scene = useReducedMotion() ? 'still' : mode;

  return (
    <div className="intro-scene" data-mode={scene} aria-hidden="true">
      <svg viewBox="0 0 200 140">
        {BLOCKS.map(([x, y]) => (
          <rect key={`${x}-${y}`} className="intro-block" x={x} y={y} width="36" height="26" rx="3" />
        ))}
        {variants ? (
          ROUTES.map((route, i) => <Route key={route.d} route={route} id={`${routeId}-${i}`} scene={scene} variant={i} />)
        ) : (
          <Route route={ROUTES[0]} id={routeId} scene={scene} />
        )}
      </svg>
    </div>
  );
}
