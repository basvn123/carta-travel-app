/* ─────────────────────────────────────────────────────────────────────────
   Small UI glyphs - line icons that inherit currentColor, matching the style
   of TransportIcons.jsx (plane/car).
   ───────────────────────────────────────────────────────────────────────── */
import React from 'react';

export function CalendarIcon({ size = 18, className = '' }) {
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
      aria-label="Dates"
    >
      <rect x="3.5" y="5" width="17" height="16" rx="2.2" />
      <path d="M8 3v4M16 3v4M3.5 10h17" />
    </svg>
  );
}

export function ChevronDownIcon({ size = 18, className = '' }) {
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
      aria-hidden="true"
    >
      <path d="M6 9.5l6 6 6-6" />
    </svg>
  );
}

export function ChevronRightIcon({ size = 18, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role="img"
      aria-hidden="true"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

export function FilterIcon({ size = 18, className = '' }) {
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
      aria-label="Filters"
    >
      <path d="M4 6h16M4 12h16M4 18h16" />
      <circle cx="9" cy="6" r="2" fill="currentColor" stroke="none" />
      <circle cx="16" cy="12" r="2" fill="currentColor" stroke="none" />
      <circle cx="10" cy="18" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function MapPinIcon({ size = 20, className = '' }) {
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
      aria-label="Map"
    >
      <path d="M12 21s-7-6.4-7-11.5a7 7 0 0 1 14 0C19 14.6 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  );
}

export function RouteIcon({ size = 20, className = '' }) {
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
      aria-label="Trip planner"
    >
      <circle cx="5" cy="6" r="2.2" />
      <circle cx="19" cy="18" r="2.2" />
      <path d="M7 7.2C10 10 8 14 12 15s2 5 5 5.4" strokeDasharray="2.4 2.6" />
    </svg>
  );
}

export function ListDayIcon({ size = 20, className = '' }) {
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
      aria-label="Day planner"
    >
      <rect x="3.5" y="5" width="17" height="16" rx="2.2" />
      <path d="M8 3v4M16 3v4M3.5 10h17" />
      <path d="M7.5 14h3M7.5 17h6" />
    </svg>
  );
}

export function BookmarkIcon({ size = 20, className = '' }) {
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
      aria-label="Saved trips"
    >
      <path d="M6.5 3.5h11a1 1 0 0 1 1 1V21l-6.5-4.4L5.5 21V4.5a1 1 0 0 1 1-1Z" />
    </svg>
  );
}

export function HomeIcon({ size = 16, className = '' }) {
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
      aria-label="Home"
    >
      <path d="M3.5 10.5 12 3.5l8.5 7" />
      <path d="M5.5 9v10.5a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9" />
      <path d="M9.5 20.5v-6h5v6" />
    </svg>
  );
}

export function PersonIcon({ size = 14, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role="img"
      aria-label="Guest"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20c1.4-4 4-6 7.5-6s6.1 2 7.5 6" />
    </svg>
  );
}

/* ─── Country-intel glyphs: line icons, 1.6 stroke, inherit currentColor ─── */

function Glyph({ size, className, label, children }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role="img"
      aria-label={label}
    >
      {children}
    </svg>
  );
}

export function TrainIcon({ size = 15, className = '' }) {
  return (
    <Glyph size={size} className={className} label="Rail">
      <rect x="5.5" y="3.5" width="13" height="13" rx="3.5" />
      <path d="M5.5 11h13" />
      <path d="M8.5 20l-2 2M15.5 20l2 2" />
      <circle cx="9" cy="13.7" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="15" cy="13.7" r="0.6" fill="currentColor" stroke="none" />
    </Glyph>
  );
}

export function BusIcon({ size = 15, className = '' }) {
  return (
    <Glyph size={size} className={className} label="Bus">
      <rect x="3.5" y="4.5" width="17" height="12.5" rx="2.5" />
      <path d="M3.5 10.5h17" />
      <path d="M8 4.5v6M13 4.5v6M18 4.5v6" />
      <circle cx="7.5" cy="19" r="1.6" />
      <circle cx="16.5" cy="19" r="1.6" />
    </Glyph>
  );
}

export function FerryIcon({ size = 15, className = '' }) {
  return (
    <Glyph size={size} className={className} label="Ferry">
      <path d="M3.5 14h17l-1.4 4.3a1.7 1.7 0 0 1-1.6 1.2H6.5a1.7 1.7 0 0 1-1.6-1.2L3.5 14Z" />
      <path d="M6 14v-3.3h8.2a1.5 1.5 0 0 1 1.1.5l2.4 2.8" />
      <path d="M9 10.7V8h3" />
    </Glyph>
  );
}

export function CarIcon({ size = 15, className = '' }) {
  return (
    <Glyph size={size} className={className} label="Car">
      <path d="M4 16v-2.2a2 2 0 0 1 .5-1.3l2.2-2.6A3 3 0 0 1 9 8.7h6a3 3 0 0 1 2.3 1.1l2.2 2.6a2 2 0 0 1 .5 1.3V16" />
      <path d="M2.5 16h19" />
      <circle cx="7.5" cy="17.5" r="1.8" />
      <circle cx="16.5" cy="17.5" r="1.8" />
    </Glyph>
  );
}

export function AlertIcon({ size = 15, className = '' }) {
  return (
    <Glyph size={size} className={className} label="Warning">
      <path d="M12 4.5 21 19.5H3L12 4.5Z" />
      <path d="M12 10v4" />
      <circle cx="12" cy="16.8" r="0.5" fill="currentColor" stroke="none" />
    </Glyph>
  );
}

export function TicketIcon({ size = 15, className = '' }) {
  return (
    <Glyph size={size} className={className} label="Vignette">
      <path d="M4 8.5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1a2 2 0 0 0 0 4v1a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1a2 2 0 0 0 0-4v-1Z" />
      <path d="M12 8v1M12 11.5v1M12 15v1" />
    </Glyph>
  );
}

export function RoadIcon({ size = 15, className = '' }) {
  return (
    <Glyph size={size} className={className} label="Tolls">
      <path d="M6.5 21 5 3M17.5 21 19 3" />
      <path d="M12 4v3M12 10.5v3M12 17v3" />
    </Glyph>
  );
}

export function CheckIcon({ size = 15, className = '' }) {
  return (
    <Glyph size={size} className={className} label="Recommended">
      <path d="M5 12.5 10 17.5 19 6.5" />
    </Glyph>
  );
}

/* ─── Planner glyphs: interests, pace, gradation, same line style ─── */

export function SparkIcon({ size = 14, className = '' }) {
  return (
    <Glyph size={size} className={className} label="Suggestion">
      <path d="M12 3.5c.7 3.6 2.6 5.7 6.5 6.5-3.9.8-5.8 2.9-6.5 6.5-.7-3.6-2.6-5.7-6.5-6.5 3.9-.8 5.8-2.9 6.5-6.5Z" />
      <path d="M18.5 15.5c.3 1.6 1.1 2.5 2.8 2.8-1.7.3-2.5 1.2-2.8 2.8-.3-1.6-1.1-2.5-2.8-2.8 1.7-.3 2.5-1.2 2.8-2.8Z" />
    </Glyph>
  );
}

export function StarIcon({ size = 14, className = '' }) {
  return (
    <Glyph size={size} className={className} label="Must see">
      <path d="m12 3.8 2.5 5.2 5.7.7-4.2 3.9 1.1 5.6L12 16.4l-5.1 2.8 1.1-5.6-4.2-3.9 5.7-.7L12 3.8Z" />
    </Glyph>
  );
}

export function InfoIcon({ size = 15, className = '' }) {
  return (
    <Glyph size={size} className={className} label="More information">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5" />
      <circle cx="12" cy="8" r="0.6" fill="currentColor" stroke="none" />
    </Glyph>
  );
}

export function MountainIcon({ size = 15, className = '' }) {
  return (
    <Glyph size={size} className={className} label="Active">
      <path d="m3 19 6-11 4 7 2.5-4L21 19H3Z" />
    </Glyph>
  );
}

export function BulbIcon({ size = 15, className = '' }) {
  return (
    <Glyph size={size} className={className} label="Tip">
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3.5a6 6 0 0 1 3.5 10.8c-.8.6-1 1.3-1 2.2h-5c0-.9-.2-1.6-1-2.2A6 6 0 0 1 12 3.5Z" />
    </Glyph>
  );
}

export function DiningIcon({ size = 15, className = '' }) {
  return (
    <Glyph size={size} className={className} label="Food and dining">
      <path d="M7 3.5v6a2 2 0 0 0 2 2v9M9 3.5v5M11 3.5v5" />
      <path d="M17 3.5c-1.7 1-2.5 3-2.5 5.5 0 1.7.8 2.5 2.5 2.5v9" />
    </Glyph>
  );
}

export function MuseumIcon({ size = 15, className = '' }) {
  return (
    <Glyph size={size} className={className} label="Museums">
      <path d="M4 9.5 12 4l8 5.5" />
      <path d="M5.5 9.5v8M9.8 9.5v8M14.2 9.5v8M18.5 9.5v8" />
      <path d="M4 20.5h16M4 17.5h16" />
    </Glyph>
  );
}

export function TreeIcon({ size = 15, className = '' }) {
  return (
    <Glyph size={size} className={className} label="Outdoors">
      <path d="M12 3 6.5 10.5h2.2L5 16h6v4.5h2V16h6l-3.7-5.5h2.2L12 3Z" />
    </Glyph>
  );
}

export function ShoppingIcon({ size = 15, className = '' }) {
  return (
    <Glyph size={size} className={className} label="Shopping">
      <path d="M5.5 8h13l-1 12.5h-11L5.5 8Z" />
      <path d="M9 10.5V6.8a3 3 0 0 1 6 0v3.7" />
    </Glyph>
  );
}

export function MoonIcon({ size = 15, className = '' }) {
  return (
    <Glyph size={size} className={className} label="Nightlife">
      <path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10Z" />
    </Glyph>
  );
}

export function MasksIcon({ size = 15, className = '' }) {
  return (
    <Glyph size={size} className={className} label="Local culture">
      <path d="M5 4.5h14v6a7 7 0 0 1-14 0v-6Z" />
      <path d="M8.5 9h.8M14.7 9h.8" />
      <path d="M9 13.5c.9 1 1.9 1.5 3 1.5s2.1-.5 3-1.5" />
    </Glyph>
  );
}

export function CameraIcon({ size = 15, className = '' }) {
  return (
    <Glyph size={size} className={className} label="Photo spots">
      <path d="M4.5 7.5h3l1.5-2h6l1.5 2h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13" r="3.5" />
    </Glyph>
  );
}

export function CoffeeIcon({ size = 15, className = '' }) {
  return (
    <Glyph size={size} className={className} label="Cafes">
      <path d="M5 8.5h11v7a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4v-7Z" />
      <path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16" />
      <path d="M8 3.5v2.5M11 3.5v2.5M14 3.5v2.5" />
    </Glyph>
  );
}

export function CastleIcon({ size = 15, className = '' }) {
  return (
    <Glyph size={size} className={className} label="Architecture">
      <path d="M5 20.5V8l2-1.5V4h2v2h2V4h2v2h2V4h2v2.5L19 8v12.5" />
      <path d="M3.5 20.5h17" />
      <path d="M10 20.5v-4.5a2 2 0 0 1 4 0v4.5" />
    </Glyph>
  );
}

export function BeachIcon({ size = 15, className = '' }) {
  return (
    <Glyph size={size} className={className} label="Beaches">
      <path d="M13.5 6.5a6 6 0 0 0-8.4 1.3l9.7 7" />
      <path d="M9.3 4.9c2.4-.4 4.7.4 6.4 2.4M13.5 6.5 11 20" />
      <path d="M3.5 20.5c2-1.4 4-1.4 6 0s4 1.4 6 0 4-1.4 5 0" />
    </Glyph>
  );
}

export function BallIcon({ size = 15, className = '' }) {
  return (
    <Glyph size={size} className={className} label="Sports">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5v17M3.5 12h17" />
      <path d="M6 5.5c3.5 3.5 8.5 3.5 12 0M6 18.5c3.5-3.5 8.5-3.5 12 0" />
    </Glyph>
  );
}

export function LotusIcon({ size = 15, className = '' }) {
  return (
    <Glyph size={size} className={className} label="Wellness">
      <path d="M12 5c1.8 2 2.6 4 2.6 6.2 0 2.7-1.1 4.6-2.6 5.8-1.5-1.2-2.6-3.1-2.6-5.8C9.4 9 10.2 7 12 5Z" />
      <path d="M4.5 10c3 .5 5 2.2 6 5.5M19.5 10c-3 .5-5 2.2-6 5.5" />
      <path d="M6 18.5c4 1.4 8 1.4 12 0" />
    </Glyph>
  );
}

export function LeafIcon({ size = 15, className = '' }) {
  return (
    <Glyph size={size} className={className} label="Relaxed">
      <path d="M19 5c-9 0-13.5 4-13.5 10.5V19" />
      <path d="M19 5c.5 8-3 12.5-9.5 12.5-1.5 0-2.9-.4-4-1.2" />
    </Glyph>
  );
}

export function ScaleIcon({ size = 15, className = '' }) {
  return (
    <Glyph size={size} className={className} label="Balanced">
      <path d="M12 5v13.5M7.5 18.5h9" />
      <path d="M6 7.5h12" />
      <path d="m6 7.5-2 5a2.6 2.6 0 0 0 4 0l-2-5ZM18 7.5l-2 5a2.6 2.6 0 0 0 4 0l-2-5Z" />
    </Glyph>
  );
}

export function BoltIcon({ size = 15, className = '' }) {
  return (
    <Glyph size={size} className={className} label="Packed">
      <path d="M13 3.5 5.5 13.5H11L10 20.5l7.5-10H12l1-7Z" />
    </Glyph>
  );
}

export function BanIcon({ size = 15, className = '' }) {
  return (
    <Glyph size={size} className={className} label="Not needed">
      <circle cx="12" cy="12" r="8" />
      <path d="M6.3 6.3 17.7 17.7" />
    </Glyph>
  );
}

/* ─── Detail-panel / planner glyphs added for the cost + day-plan redesign ─── */

export function ReceiptIcon({ size = 15, className = '' }) {
  return (
    <Glyph size={size} className={className} label="Cost breakdown">
      <path d="M6 3.5h12v17l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4v-17Z" />
      <path d="M9 8h6M9 11.5h6M9 15h3.5" />
    </Glyph>
  );
}

export function BedIcon({ size = 15, className = '' }) {
  return (
    <Glyph size={size} className={className} label="Accommodation">
      <path d="M3.5 18.5v-11" />
      <path d="M3.5 15.5h17v3" />
      <path d="M3.5 12.5h17a0 0 0 0 1 0 0v3" />
      <path d="M10 12.5V9.5a1.5 1.5 0 0 1 1.5-1.5h6a3 3 0 0 1 3 3v1.5" />
      <circle cx="6.8" cy="10.3" r="1.6" />
    </Glyph>
  );
}

export function ShareIcon({ size = 15, className = '' }) {
  return (
    <Glyph size={size} className={className} label="Share">
      <circle cx="6" cy="12" r="2.6" />
      <circle cx="17.5" cy="5.5" r="2.6" />
      <circle cx="17.5" cy="18.5" r="2.6" />
      <path d="m8.4 10.8 6.8-4M8.4 13.2l6.8 4" />
    </Glyph>
  );
}

export function LinkIcon({ size = 15, className = '' }) {
  return (
    <Glyph size={size} className={className} label="Link">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </Glyph>
  );
}

/* Apple with a pulse line, deliberately unlike the filter/sliders glyphs,
   which it used to be mistaken for in the mobile toolbar. */
export function LifestyleIcon({ size = 15, className = '' }) {
  return (
    <Glyph size={size} className={className} label="Lifestyle settings">
      <path d="M15.1 7c2.4 0 4.2 2 4.2 4.8 0 3.9-2.8 8.4-5.3 8.4-.9 0-1.3-.55-2-.55s-1.1.55-2 .55c-2.5 0-5.3-4.5-5.3-8.4C4.7 9 6.5 7 8.9 7c1.3 0 2.1.7 3.1.7S13.8 7 15.1 7Z" />
      <path d="M12 6.6c0-1.9 1.3-3.2 3.1-3.4 0 1.9-1.3 3.2-3.1 3.4Z" />
      <path d="M7.4 13.6h1.9l1.2-2.4 1.8 4.6 1.3-2.2h2.9" />
    </Glyph>
  );
}

export function LockIcon({ size = 15, className = '' }) {
  return (
    <Glyph size={size} className={className} label="Password">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7.5a4 4 0 0 1 8 0V11" />
      <path d="M12 14.5v2" />
    </Glyph>
  );
}

/* Show/hide password. The struck-through eye is the only glyph pair in here
   that has to read at 16px inside an input, so it stays coarse on purpose. */
export function EyeIcon({ size = 15, className = '' }) {
  return (
    <Glyph size={size} className={className} label="Show password">
      <path d="M2.6 12S6.2 5.8 12 5.8 21.4 12 21.4 12 17.8 18.2 12 18.2 2.6 12 2.6 12Z" />
      <circle cx="12" cy="12" r="3" />
    </Glyph>
  );
}

export function EyeOffIcon({ size = 15, className = '' }) {
  return (
    <Glyph size={size} className={className} label="Hide password">
      <path d="M9.9 6.1a8.9 8.9 0 0 1 2.1-.3c5.8 0 9.4 6.2 9.4 6.2a16.7 16.7 0 0 1-3.3 4" />
      <path d="M6.4 7.9A16.8 16.8 0 0 0 2.6 12S6.2 18.2 12 18.2a8.9 8.9 0 0 0 3.6-.7" />
      <path d="M10 10a2.8 2.8 0 0 0 4 4" />
      <path d="M4.2 4.2 19.8 19.8" />
    </Glyph>
  );
}

/* Door with an arrow leaving it: session control, not account deletion. */
export function SignOutIcon({ size = 15, className = '' }) {
  return (
    <Glyph size={size} className={className} label="Session">
      <path d="M14.5 8.2V6a1.8 1.8 0 0 0-1.8-1.8H6.3A1.8 1.8 0 0 0 4.5 6v12a1.8 1.8 0 0 0 1.8 1.8h6.4a1.8 1.8 0 0 0 1.8-1.8v-2.2" />
      <path d="M10.5 12h9M16.4 8.7 19.7 12l-3.3 3.3" />
    </Glyph>
  );
}

/* Shield: the privacy section, distinct from LockIcon which marks the
   password form two sections above it. */
export function ShieldIcon({ size = 15, className = '' }) {
  return (
    <Glyph size={size} className={className} label="Privacy">
      <path d="M12 3.5 19 6v5.6c0 4.2-2.9 7.4-7 8.9-4.1-1.5-7-4.7-7-8.9V6l7-2.5Z" />
      <path d="m9.2 11.8 2 2 3.6-3.6" />
    </Glyph>
  );
}

export function DownloadIcon({ size = 15, className = '' }) {
  return (
    <Glyph size={size} className={className} label="Download">
      <path d="M12 4v10M7.5 10.5 12 15l4.5-4.5" />
      <path d="M4.5 18.5h15" />
    </Glyph>
  );
}

export function UploadIcon({ size = 15, className = '' }) {
  return (
    <Glyph size={size} className={className} label="Upload">
      <path d="M12 15V5M7.5 9.5 12 5l4.5 4.5" />
      <path d="M4.5 18.5h15" />
    </Glyph>
  );
}

export function PencilIcon({ size = 15, className = '' }) {
  return (
    <Glyph size={size} className={className} label="Edit">
      <path d="M4.5 19.5 5.3 16 16 5.3a1.8 1.8 0 0 1 2.6 0l.1.1a1.8 1.8 0 0 1 0 2.6L8 18.7l-3.5.8Z" />
      <path d="M14.2 7.1l2.7 2.7" />
    </Glyph>
  );
}

/* The quiet "more" affordance on a card: one dot row instead of a row of
   competing buttons, so the card's own tap target stays the loud thing. */
export function MoreIcon({ size = 15, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} role="img" aria-label="More">
      <circle cx="5.5" cy="12" r="1.7" fill="currentColor" />
      <circle cx="12" cy="12" r="1.7" fill="currentColor" />
      <circle cx="18.5" cy="12" r="1.7" fill="currentColor" />
    </svg>
  );
}

export function TrashIcon({ size = 15, className = '' }) {
  return (
    <Glyph size={size} className={className} label="Remove">
      <path d="M4.5 6.5h15" />
      <path d="M9.5 6.5V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v1.5" />
      <path d="M6.5 6.5 7.4 19a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-12.5" />
      <path d="M10.5 10v6.5M13.5 10v6.5" />
    </Glyph>
  );
}

export function SearchIcon({ size = 15, className = '' }) {
  return (
    <Glyph size={size} className={className} label="Search">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M20 20l-4.6-4.6" />
    </Glyph>
  );
}

export function PiggyIcon({ size = 15, className = '' }) {
  return (
    <Glyph size={size} className={className} label="Save money">
      <path d="M5 11.5c0-3.6 3.1-6 7-6s7 2.4 7 6c0 1.4-.5 2.6-1.3 3.6l.6 2.9-2.7-.9c-1 .4-2.3.7-3.6.7-3.9 0-7-2.5-7-6.3Z" />
      <path d="M5.4 10.3c-1.2 0-2.1.6-2.4 1.7.3 1.1 1.2 1.7 2.4 1.7" />
      <path d="M15.4 10.9h.01" />
      <path d="M9.5 5.9c.4-1 1.4-1.7 2.5-1.7s2.1.7 2.5 1.7" />
    </Glyph>
  );
}

/* Filled tier marks, paired with StarIcon to show the stay-map's rating tiers
   as glyphs rather than a colour code. */
export function DiamondIcon({ size = 9, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} role="img" aria-label="Great stop">
      <path d="M12 2.5 21.5 12 12 21.5 2.5 12Z" fill="currentColor" />
    </svg>
  );
}

export function DotIcon({ size = 8, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} role="img" aria-label="Worth a look">
      <circle cx="12" cy="12" r="6.5" fill="currentColor" />
    </svg>
  );
}

export function LuggageIcon({ size = 16, className = '' }) {
  return (
    <Glyph size={size} className={className} label="Baggage">
      <rect x="6" y="7.5" width="12" height="12.5" rx="2" />
      <path d="M9.5 7.5V5.5a1.5 1.5 0 0 1 1.5-1.5h2a1.5 1.5 0 0 1 1.5 1.5v2" />
      <path d="M10 11v6M14 11v6" />
    </Glyph>
  );
}

export function ClockIcon({ size = 15, className = '' }) {
  return (
    <Glyph size={size} className={className} label="Time">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </Glyph>
  );
}
