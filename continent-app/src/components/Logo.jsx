/* ─────────────────────────────────────────────────────────────────────────
   The app's mark (house style G1, 2026-11): the blaze, the waymark painted
   on a rock. A white halo with a hairline edge, the square umber paint
   stripe, the short ink heel, in the same proportions as `.hs-blaze` and the
   app icons (scripts/og/icons.mjs, cards.mjs blazeShapes). It carries no
   letters, so it does not depend on the app's name. It replaces the T212
   compass (DESIGN.md bans a compass rose; owner 2026-11-13: a full custom
   house style). The square 32 box keeps every caller's layout.
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
      aria-label="Viantra"
    >
      <rect x="4" y="9" width="24" height="14" rx="1" fill="var(--surface)" stroke="var(--edge)" strokeWidth="0.6" />
      <rect x="7.36" y="11.8" width="17.28" height="5.04" fill="var(--action)" />
      <rect x="16.48" y="19.5" width="8.16" height="1.54" fill="var(--text)" />
    </svg>
  );
}
