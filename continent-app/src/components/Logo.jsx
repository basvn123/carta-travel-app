/* ─────────────────────────────────────────────────────────────────────────
   Carta - logo mark
   A cartographic compass: an engraved ring with a four-point needle.
   Lagoon (T425): the north needle is the lagoon teal, the rest is ink, the
   pivot is the surface. The app icons draw the same mark white on teal
   (scripts/og/icons.mjs).
   ───────────────────────────────────────────────────────────────────────── */

export default function Logo({ size = 28, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      role="img"
      aria-label="Carta"
    >
      {/* engraved ring */}
      <circle cx="16" cy="16" r="13" stroke="var(--text)" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="9.5" stroke="var(--border)" strokeWidth="1" />

      {/* compass needle - north (lagoon teal) */}
      <path d="M16 5.5 L19 16 L16 13.2 L13 16 Z" fill="var(--action)" />
      {/* compass needle - south (ink) */}
      <path d="M16 26.5 L13 16 L16 18.8 L19 16 Z" fill="var(--text)" />

      {/* pivot */}
      <circle cx="16" cy="16" r="1.4" fill="var(--surface)" stroke="var(--text)" strokeWidth="1" />
    </svg>
  );
}
