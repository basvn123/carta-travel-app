/* ─────────────────────────────────────────────────────────────────────────
   Carta - logo mark
   A cartographic compass: an engraved ring with a four-point needle.
   The north needle is rust; the rest is ink. Inherits currentColor so it
   sits cleanly on paper or dark surfaces.
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
      <circle cx="16" cy="16" r="13" stroke="var(--ink)" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="9.5" stroke="var(--rule)" strokeWidth="1" />

      {/* compass needle - north (rust) */}
      <path d="M16 5.5 L19 16 L16 13.2 L13 16 Z" fill="var(--accent)" />
      {/* compass needle - south (ink) */}
      <path d="M16 26.5 L13 16 L16 18.8 L19 16 Z" fill="var(--ink)" />

      {/* pivot */}
      <circle cx="16" cy="16" r="1.4" fill="var(--paper)" stroke="var(--ink)" strokeWidth="1" />
    </svg>
  );
}
