/** Inline stroke icons (Lucide-style) matching the design reference. */

const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
} as const;

export function ChevronDown({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...base} stroke="var(--muted)">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function IconGuideline() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" {...base}>
      <path d="M4 4h16v16H4zM4 9h16M9 9v11" />
    </svg>
  );
}

export function IconEregistry() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" {...base}>
      <path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}

export function IconDeed() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" {...base}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

/** Brand mark — gold pediment over three pillars on a terracotta square. */
export function BrandMark() {
  return (
    <svg width={44} height={44} viewBox="0 0 48 48" aria-hidden>
      <rect width="48" height="48" rx="7" fill="var(--primary)" />
      <path d="M24 8 12 18v2h24v-2L24 8Z" fill="var(--accent-2)" />
      <rect x="14" y="20" width="3.5" height="15" fill="#FDF5EC" />
      <rect x="22" y="20" width="3.5" height="15" fill="#FDF5EC" />
      <rect x="30" y="20" width="3.5" height="15" fill="#FDF5EC" />
      <rect x="12" y="36" width="24" height="3.5" fill="var(--accent-2)" />
    </svg>
  );
}
