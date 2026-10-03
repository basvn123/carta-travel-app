/* One 20px, 1.5px-stroke set for the packing grid. currentColor, no tile. */
import React from 'react';

const P = {
  light: <><path d="M9 3h6l1 5H8l1-5Z" /><path d="M8 8l-1 3h10l-1-3" /><path d="M12 11v4M12 18v3M6 17l-2 1M18 17l2 1" /></>,
  rain: <><path d="M5 13a7 7 0 0 1 14 0H5Z" /><path d="M12 6V4M12 13v5a2 2 0 0 1-4 0" /></>,
  poles: <><path d="M7 3v18M17 3v18" /><path d="M5 8h4M15 8h4M6 18l1 3 1-3M16 18l1 3 1-3" /></>,
  adapter: <><rect x="6" y="8" width="12" height="9" rx="2" /><path d="M9 8V4M15 8V4M12 17v3" /></>,
  lock: <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3M12 15v2" /></>,
  drybag: <><path d="M7 7h10l1 12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L7 7Z" /><path d="M8 7l1-3h6l1 3M9 12h6" /></>,
  shoes: <><path d="M4 16v-4l4-1 2 2 6 1a4 4 0 0 1 4 4v1H4v-3Z" /><path d="M4 18h16" /></>,
  layer: <><path d="M9 4l-5 3 2 4 2-1v10h8V10l2 1 2-4-5-3a3 3 0 0 1-6 0Z" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" /></>,
  bottle: <><path d="M10 3h4v3l1.5 2.5V20a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1V8.5L10 6V3Z" /><path d="M8.5 12h7" /></>,
  cash: <><rect x="3" y="7" width="18" height="10" rx="2" /><circle cx="12" cy="12" r="2.5" /></>,
  swim: <><path d="M3 15c2 0 2-1.5 4.5-1.5S10 15 12 15s2.5-1.5 4.5-1.5S19 15 21 15" /><path d="M3 19c2 0 2-1.5 4.5-1.5S10 19 12 19s2.5-1.5 4.5-1.5S19 19 21 19" /><circle cx="15" cy="7" r="2" /><path d="M7 11l4-3 3 2" /></>,
  bag: <><path d="M6 8h12l1 12H5L6 8Z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>,
  phrase: <><path d="M4 5h16v11H11l-4 4v-4H4V5Z" /><path d="M8 9h8M8 12h5" /></>,
  repair: <><path d="M14.5 6.5a4 4 0 0 0-5 5L4 17l3 3 5.5-5.5a4 4 0 0 0 5-5l-2.5 2.5-2.5-1-1-2.5 2.5-2.5Z" /></>,
  shorts: <><path d="M6 4h12l1.5 16h-5.5l-2-8-2 8H4.5L6 4Z" /><path d="M6 8h12" /></>,
  helmet: <><path d="M4 15a8 8 0 0 1 16 0v2H4v-2Z" /><path d="M9 7l1 6M14 7l-1 6M4 17h16" /></>,
  gloves: <><path d="M8 20v-6L6 9V6a1 1 0 0 1 2 0v3M8 9V4a1 1 0 0 1 2 0v5M10 9V3.5a1 1 0 0 1 2 0V9M12 9V5a1 1 0 0 1 2 0v6l2-2a1 1 0 0 1 1.5 1.5L15 15v5H8Z" /></>,
  firstaid: <><rect x="4" y="7" width="16" height="13" rx="2" /><path d="M9 7V5h6v2M12 10.5v6M9 13.5h6" /></>,
  power: <><rect x="8" y="3" width="8" height="18" rx="2" /><path d="M12.5 8l-2 4h3l-2 4" /></>,
  nav: <><path d="M4 6l5-2 6 2 5-2v14l-5 2-6-2-5 2V6Z" /><path d="M9 4v14M15 6v14" /></>,
  snack: <><path d="M5 9l7-5 7 5v3H5V9Z" /><path d="M6 12v7h12v-7M10 16h4" /></>,
  shirt: <><path d="M9 4l-5 3 2 4 2-1v10h8V10l2 1 2-4-5-3-3 2-3-2Z" /></>,
  goggles: <><rect x="3" y="8" width="18" height="8" rx="4" /><path d="M12 8v8M3 12H2M22 12h-1" /></>,
  daypack: <><path d="M9 6.5V5a3 3 0 0 1 6 0v1.5" /><path d="M6.5 9.5a5.5 5.5 0 0 1 11 0V20h-11V9.5Z" /><path d="M6.5 13.5h11M9.5 13.5v3" /></>,
  towel: <><path d="M5 5h14v14H5V5Z" /><path d="M5 9h14M8 13v6M12 13v6M16 13v6" /></>,
  camera: <><rect x="3" y="7" width="18" height="12" rx="2" /><circle cx="12" cy="13" r="3.5" /><path d="M9 7l1-2h4l1 2" /></>,
};

export function PackIcon({ name, size = 20 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {P[name] || P.daypack}
    </svg>
  );
}
