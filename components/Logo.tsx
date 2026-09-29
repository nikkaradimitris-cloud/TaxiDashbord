/** Το λογότυπο: το ίδιο σχέδιο με το εικονίδιο της εφαρμογής (app/icon.svg), με απλά χρώματα. */
export function Logo({ className = 'h-10 w-10' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#facc15" />
      <g transform="translate(0 3.25)">
        <rect x="25" y="11" width="14" height="7" rx="2" fill="#111827" />
        <rect x="28" y="13.4" width="8" height="2.2" rx="1.1" fill="#fde68a" />
        <path
          d="M12 44V35l5-11a6 6 0 0 1 5.5-3.6h19A6 6 0 0 1 47 24l5 11v9a2.5 2.5 0 0 1-2.5 2.5h-3A2.5 2.5 0 0 1 44 44v-1.5H20V44a2.5 2.5 0 0 1-2.5 2.5h-3A2.5 2.5 0 0 1 12 44z"
          fill="#111827"
        />
        <path d="M19.5 33l3-7.4a2.5 2.5 0 0 1 2.3-1.6h14.4a2.5 2.5 0 0 1 2.3 1.6l3 7.4z" fill="#fef08a" />
        <circle cx="20" cy="38" r="3" fill="#fef9c3" />
        <circle cx="44" cy="38" r="3" fill="#fef9c3" />
        <rect x="27" y="37" width="10" height="2" rx="1" fill="#374151" />
      </g>
    </svg>
  );
}
