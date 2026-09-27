export function Logo({ className = 'h-10 w-10' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#facc15" />
      <rect x="25" y="11" width="14" height="7" rx="2" fill="#1f2937" />
      <path
        d="M12 44V35l5-11a6 6 0 0 1 5.5-3.6h19A6 6 0 0 1 47 24l5 11v9a2.5 2.5 0 0 1-2.5 2.5h-3A2.5 2.5 0 0 1 44 44v-1.5H20V44a2.5 2.5 0 0 1-2.5 2.5h-3A2.5 2.5 0 0 1 12 44z"
        fill="#1f2937"
      />
      <path d="M19.5 33l3-7.4a2.5 2.5 0 0 1 2.3-1.6h14.4a2.5 2.5 0 0 1 2.3 1.6l3 7.4z" fill="#facc15" />
      <circle cx="20" cy="38" r="3" fill="#facc15" />
      <circle cx="44" cy="38" r="3" fill="#facc15" />
    </svg>
  );
}
