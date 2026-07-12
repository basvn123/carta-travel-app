/* ─────────────────────────────────────────────────────────────────────────
   Transport mode icons - line glyphs that inherit currentColor so they sit
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
      <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
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
