'use client';

import { useId } from 'react';
import { useReducedMotion } from './motion';

// Χάρτης 200×140: τετράγωνα 36×26 με δρόμους 8 ανάμεσα, στο κέντρο· η διαδρομή πάει από δρόμο σε δρόμο.
const BLOCKS = [16, 60, 104, 148].flatMap((x) => [6, 40, 74, 108].map((y) => [x, y] as const));
const ROUTE = 'M8 104H100V70H144V36H192';
const START = [8, 104] as const;
const END = [192, 36] as const;
const SPLINE = '0.5 0.05 0.25 1';

/**
 * Πόλη τη νύχτα: μια διαδρομή ζωγραφίζεται πάνω στους δρόμους και το ταξί την ακολουθεί.
 * `once`: μία φορά (κίνηση ανοίγματος)· `loop`: ξανά και ξανά· `still`: ακίνητη, τελική εικόνα.
 */
export function CityScene({ mode }: { mode: 'once' | 'loop' | 'still' }) {
  const routeId = `intro-route-${useId().replace(/[^\w-]/g, '')}`;
  const scene = useReducedMotion() ? 'still' : mode;

  return (
    <div className="intro-scene" data-mode={scene} aria-hidden="true">
      <svg viewBox="0 0 200 140">
        {BLOCKS.map(([x, y]) => (
          <rect key={`${x}-${y}`} className="intro-block" x={x} y={y} width="36" height="26" rx="3" />
        ))}
        <path className="intro-route-glow" d={ROUTE} pathLength={100} />
        <path id={routeId} className="intro-route" d={ROUTE} pathLength={100} />
        <circle className="intro-pin" cx={START[0]} cy={START[1]} r="3.2" />
        <circle className="intro-ping" cx={END[0]} cy={END[1]} r="3.2" />
        <circle className="intro-pin" cx={END[0]} cy={END[1]} r="3.2" />
        <g transform={scene === 'still' ? `translate(${END[0]} ${END[1]})` : undefined}>
          <circle className="intro-taxi-halo" r="7" />
          <circle className="intro-taxi-dot" r="3.6" />
          {scene === 'once' && (
            <animateMotion dur="0.95s" fill="freeze" calcMode="spline" keyTimes="0;1" keyPoints="0;1" keySplines={SPLINE}>
              <mpath href={`#${routeId}`} />
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
                <mpath href={`#${routeId}`} />
              </animateMotion>
              <animate attributeName="opacity" dur="3.2s" repeatCount="indefinite" values="1;1;0" keyTimes="0;0.85;1" />
            </>
          )}
        </g>
      </svg>
    </div>
  );
}
