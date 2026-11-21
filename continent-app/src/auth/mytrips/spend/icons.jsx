/*
 * The Uitgaven page's own glyphs (G15), drawn from the approved prototype
 * (.work/2026-11-21-spend-capture/prototype): the plate with fork and knife
 * for food, the tram, the ticket, the wallet on the trip page, the mic and
 * the keypad's delete key. Line icons on currentColor, as Icons.jsx.
 */
import React from 'react';

function Glyph({ size = 20, children, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      {children}
    </svg>
  );
}

export const FoodGlyph = (p) => (
  <Glyph {...p}><circle cx="12.5" cy="12" r="4.5" /><path d="M3 4v4.5a1.5 1.5 0 0 0 3 0V4M4.5 9.5V20M21 20V4c-1.4.6-2.2 2.4-2.2 5.5V13H21" /></Glyph>
);
export const TramGlyph = (p) => (
  <Glyph {...p}><rect x="5" y="3" width="14" height="13" rx="3" /><path d="M5 10h14M8 20l-2 2M16 20l2 2" /></Glyph>
);
export const TicketGlyph = (p) => (
  <Glyph {...p}><path d="M3 9h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z" /></Glyph>
);
export const DotsGlyph = (p) => (
  <Glyph {...p}><circle cx="6" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="18" cy="12" r="1.5" /></Glyph>
);
export const WalletGlyph = (p) => (
  <Glyph {...p}><rect x="3" y="6" width="18" height="14" rx="3" /><path d="M3 10h18M16 15h2" /></Glyph>
);
export const MicGlyph = (p) => (
  <Glyph {...p}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></Glyph>
);
export const CamGlyph = (p) => (
  <Glyph {...p}><rect x="3" y="6" width="18" height="14" rx="2" /><circle cx="12" cy="13" r="3.5" /><path d="M8 6l1.5-2h5L16 6" /></Glyph>
);
export const PhotoGlyph = (p) => (
  <Glyph {...p}><rect x="3" y="6" width="18" height="14" rx="2" /><circle cx="12" cy="13" r="3.5" /></Glyph>
);
export const DelGlyph = (p) => (
  <Glyph {...p}><path d="M20 6H9l-5 6 5 6h11z" /><path d="M13 10l4 4M17 10l-4 4" /></Glyph>
);
export const BackGlyph = (p) => <Glyph {...p}><path d="M15 6l-6 6 6 6" /></Glyph>;
export const ChevGlyph = (p) => <Glyph {...p}><path d="M9 6l6 6-6 6" /></Glyph>;
export const PlusGlyph = (p) => <Glyph {...p}><path d="M12 5v14M5 12h14" /></Glyph>;
export const CheckGlyph = (p) => <Glyph {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></Glyph>;
export const LockGlyph = (p) => (
  <Glyph {...p}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></Glyph>
);
export const LinkGlyph = (p) => (
  <Glyph {...p}><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></Glyph>
);
export const ArrowGlyph = (p) => <Glyph {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Glyph>;
export const ChatGlyph = (p) => <Glyph {...p}><path d="M4 20l1.5-4A8 8 0 1 1 9 19.5z" /></Glyph>;
export const SmsGlyph = (p) => (
  <Glyph {...p}><rect x="3" y="5" width="18" height="13" rx="2" /><path d="M3 7l9 6 9-6" /></Glyph>
);
export const CopyGlyph = (p) => (
  <Glyph {...p}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></Glyph>
);
export const ShareGlyph = (p) => (
  <Glyph {...p}><path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" /></Glyph>
);

/** The category glyph, by the ledger's own category. */
export const CAT_GLYPH = { food: FoodGlyph, transport: TramGlyph, activities: TicketGlyph, other: DotsGlyph };
