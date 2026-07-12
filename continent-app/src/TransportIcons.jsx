/* ─────────────────────────────────────────────────────────────────────────
   Transport mode icons — line glyphs that inherit currentColor so they sit
   cleanly inside the segmented "Travel by" toggle (plane vs car).
   ───────────────────────────────────────────────────────────────────────── */
import React from 'react';

export function PlaneIcon({ size = 18, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role="img"
      aria-label="Plane"
    >
      <path d="M21 15.5 3.5 12l0-2.3 3 0.8 2 -3 1.9 0.6 -1 3 4.8 1.3 3.2 -4.4 1.9 0.6 -1.8 5.1 3 0.8z" />
      <path d="M9 20l2.5-2" />
    </svg>
  );
}

export function CarIcon({ size = 18, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role="img"
      aria-label="Car"
    >
      <path d="M4 13l1.4-4.1A2 2 0 0 1 7.3 7.5h9.4a2 2 0 0 1 1.9 1.4L20 13" />
      <path d="M3 13h18v3.5a1 1 0 0 1-1 1h-1.5" />
      <path d="M5.5 17.5H4a1 1 0 0 1-1-1V13" />
      <path d="M8.5 17.5h7" />
      <circle cx="7" cy="17.5" r="1.6" />
      <circle cx="17" cy="17.5" r="1.6" />
    </svg>
  );
}
