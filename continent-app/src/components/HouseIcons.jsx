/*
 * The house icon set (G1, house style 2026-11, DESIGN.md "Icons"): drawn on a
 * 24 px grid with a 1.75 stroke, square caps and mitred joins, to sit beside
 * Overpass. Generated once from the chosen prototype's drawings; edit a path
 * here by hand from now on. Every glyph inherits currentColor and is
 * decorative (aria-hidden): the control around it carries the name. Use them
 * through the kit's Icon wrapper:
 *
 *   <Icon as={HouseIcon.signpost} size="md" />
 *
 * No sparkle for AI (Ask carries a boxed "AI" tag), no globe for countries
 * (borders), no compass rose, no plane with a dashed trail.
 */
import React from 'react';

function glyph(name, body) {
  function G({ size = 20, className = '' }) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.75" strokeLinecap="square" strokeLinejoin="miter"
        className={`hs-icon hs-icon-${name}${className ? ` ${className}` : ''}`}
        aria-hidden="true" focusable="false">
        {body}
      </svg>
    );
  }
  G.displayName = `HouseIcon(${name})`;
  return G;
}

export const HouseIcon = {
  signpost: glyph('signpost', <><path d="M11 21.5V2.5" /><path d="M4 4.5h12.5l3 3-3 3H4z" /><path d="M18 13H7.5l-3 2.75 3 2.75H18z" /></>),
  route: glyph('route', <><path d="M6 18.5V10a3 3 0 0 1 3-3h6a3 3 0 0 0 3-3" /><path d="M3 18.5h6v3H3z" /><path d="M15 2.5h6v3h-6z" /></>),
  cairn: glyph('cairn', <><path className="stone" d="M3.5 19.4c0-1.6 3.8-2.7 8.5-2.7s8.5 1.1 8.5 2.7-3.8 1.9-8.5 1.9-8.5-.3-8.5-1.9z" /><path className="stone" d="M6.3 14.1c0-1.5 2.5-2.5 5.6-2.5s5.9 1 5.9 2.5-2.8 1.8-5.9 1.8-5.6-.3-5.6-1.8z" /><path className="stone" d="M8.7 9.2c0-1.4 1.6-2.4 3.5-2.4s3.8 1 3.8 2.4-1.9 1.7-3.8 1.7-3.5-.3-3.5-1.7z" /><path className="stone" d="M10.6 4.6c0-.9.7-1.5 1.6-1.5s1.6.6 1.6 1.5-.7 1.2-1.6 1.2-1.6-.3-1.6-1.2z" /></>),
  search: glyph('search', <><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5l5.5 5.5" /></>),
  people: glyph('people', <><circle cx="9" cy="7.5" r="3.5" /><path d="M2.5 20.5v-2a5 5 0 0 1 5-5h3a5 5 0 0 1 5 5v2" /><path d="M16 4.5a3.5 3.5 0 0 1 0 6.5" /><path d="M19 13.8a5 5 0 0 1 2.5 4.4v2.3" /></>),
  calendar: glyph('calendar', <><path d="M3.5 5.5h17v15h-17z" /><path d="M3.5 10h17" /><path d="M8 3v4.5M16 3v4.5" /></>),
  from: glyph('from', <><path d="M6 21.5V3" /><path d="M6 4h12l-2.5 3.5L18 11H6" /></>),
  lifestyle: glyph('lifestyle', <><path d="M4 6.5h10M18 6.5h2M4 12h3M11 12h9M4 17.5h11M19 17.5h1" /><path d="M14 4.5h4v4h-4zM7 10h4v4H7zM15 15.5h4v4h-4z" /></>),
  pack: glyph('pack', <><path d="M6 8.5a6 6 0 0 1 12 0v12H6z" /><path d="M9 5V3h6v2" /><path d="M6 13h12" /><path d="M10 13v2.5h4V13" /></>),
  borders: glyph('borders', <><path d="M3 4.5l6 2 6-2 6 2v13l-6-2-6 2-6-2z" /><path d="M9 6.5v13" strokeDasharray="2 2.5" /><path d="M15 4.5v13" strokeDasharray="2 2.5" /></>),
  rings: glyph('rings', <><circle cx="8.5" cy="12" r="5.5" /><circle cx="15.5" cy="12" r="5.5" /></>),
  bed: glyph('bed', <><path d="M3 19.5v-13" /><path d="M3 14h18v5.5" /><path d="M11 14V9.5h7a3 3 0 0 1 3 3V14" /><path d="M5.5 11h3.5v3H5.5z" /></>),
  food: glyph('food', <><path d="M3 11.5h18a9 9 0 0 1-18 0z" /><path d="M8 8.5c0-1.5 1.5-1.5 1.5-3M12 8.5c0-1.5 1.5-1.5 1.5-3M16 8.5c0-1.5 1.5-1.5 1.5-3" /></>),
  flight: glyph('flight', <><path d="M12 2.5c.8 0 1.3.7 1.3 1.6V9l7.2 4.3v2l-7.2-2.1v4.6l2.2 1.7v1.5L12 20.2 8.5 21v-1.5l2.2-1.7v-4.6l-7.2 2.1v-2L10.7 9V4.1c0-.9.5-1.6 1.3-1.6z" /></>),
  car: glyph('car', <><path d="M3.5 16.5v-4l2-5.5h13l2 5.5v4z" /><path d="M3.5 12.5h17" /><path d="M6 16.5v3M18 16.5v3" /><path d="M7 14.5h1M16 14.5h1" /></>),
  bus: glyph('bus', <><path d="M5 3.5h14v14H5z" /><path d="M5 11h14" /><path d="M7.5 20.5v-3M16.5 20.5v-3" /><path d="M8 14.5h1M15 14.5h1" /></>),
  train: glyph('train', <><path d="M6 3.5h12v12.5H6z" /><path d="M6 10h12" /><path d="M8.5 20.5l2-4.5M15.5 20.5l-2-4.5" /><path d="M9 13h.5M14.5 13h.5" /></>),
  ferry: glyph('ferry', <><path d="M3 15.5h18l-2.5 4h-13z" /><path d="M6 15.5v-5h12v5" /><path d="M10 10.5V6h4v4.5" /></>),
  walk: glyph('walk', <><path d="M8.5 2.5c1.9 0 2.8 1.9 2.8 4.6s-.9 4.6-2.8 4.6-2.8-1.9-2.8-4.6.9-4.6 2.8-4.6z" /><path d="M6.6 14h3.8v2.7a1.9 1.9 0 0 1-3.8 0z" /><path d="M15.5 7.5c1.9 0 2.8 1.9 2.8 4.6s-.9 4.6-2.8 4.6-2.8-1.9-2.8-4.6.9-4.6 2.8-4.6z" /><path d="M13.6 19h3.8" /></>),
  places: glyph('places', <><path d="M11 21.5V2.5" /><path d="M4 4.5h12.5l3 3-3 3H4z" /></>),
  trails: glyph('trails', <><path d="M4 20.5c3-1 4-3 6-6s4-4 10-5" /><path d="M4 9.5h4v3H4z" /><path d="M16 15.5h4v3h-4z" /></>),
  beaches: glyph('beaches', <><path d="M2.5 18c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 3-1.5" /><circle cx="16" cy="7.5" r="3" /><path d="M4 13.5h10" /></>),
  lakes: glyph('lakes', <><path d="M3 13.5c2 0 2-1.5 4.5-1.5s2.5 1.5 4.5 1.5 2-1.5 4.5-1.5 2.5 1.5 4.5 1.5" /><path d="M3 18c2 0 2-1.5 4.5-1.5S10 18 12 18s2-1.5 4.5-1.5S19 18 21 18" /><path d="M5 9l4-5 3 3.5 2-2 4 3.5" /></>),
  mountains: glyph('mountains', <><path d="M2.5 20.5L9 7l4 7 2.5-3.5 6 10z" /></>),
  cycling: glyph('cycling', <><circle cx="6" cy="16" r="4" /><circle cx="18" cy="16" r="4" /><path d="M6 16l4-7h6l2 7M10 9l3 7h-7M14 5.5h3" /></>),
  up: glyph('up', <><path d="M3 20.5L10 7l4 6 2.5-3.5 4.5 11z" /></>),
  plus: glyph('plus', <><path d="M12 4.5v15M4.5 12h15" /></>),
  minus: glyph('minus', <><path d="M4.5 12h15" /></>),
  close: glyph('close', <><path d="M5.5 5.5l13 13M18.5 5.5l-13 13" /></>),
  back: glyph('back', <><path d="M20 12H5" /><path d="M11 5.5L4.5 12l6.5 6.5" /></>),
  next: glyph('next', <><path d="M9 5.5l6.5 6.5L9 18.5" /></>),
  prev: glyph('prev', <><path d="M15 5.5L8.5 12l6.5 6.5" /></>),
  map: glyph('map', <><path d="M3 5.5l6-2 6 2 6-2v15l-6 2-6-2-6 2z" /><path d="M9 3.5v15M15 5.5v15" /></>),
  list: glyph('list', <><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 5h2.5v2H3zM3 11h2.5v2H3zM3 17h2.5v2H3z" /></>),
  filter: glyph('filter', <><path d="M3 6.5h18M3 12h18M3 17.5h18" /><path d="M7 4.5h3v4H7zM14 10h3v4h-3zM9 15.5h3v4H9z" /></>),
  sort: glyph('sort', <><path d="M7 3.5v17M3 7l4-4 4 4" /><path d="M17 20.5v-17M13 17l4 4 4-4" /></>),
  account: glyph('account', <><path d="M3.5 3.5h17v17h-17z" /><circle cx="12" cy="10" r="3.2" /><path d="M6.5 20.5a5.5 5.5 0 0 1 11 0" /></>),
  check: glyph('check', <><path className="check-path" d="M4.5 12.5l5 5 10-11" /></>),
  out: glyph('out', <><path d="M14 4h6v6" /><path d="M20 4l-9 9" /><path d="M18 14v6H4V6h6" /></>),
  edit: glyph('edit', <><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13 7l4 4" /></>),
  share: glyph('share', <><path d="M12 3v12" /><path d="M7 7.5L12 2.5l5 5" /><path d="M4.5 11.5v9h15v-9" /></>),
  download: glyph('download', <><path d="M12 3v12" /><path d="M7 10.5l5 5 5-5" /><path d="M4.5 20.5h15" /></>),
  more: glyph('more', <><path d="M5 12h.5M12 12h.5M19 12h.5" strokeWidth="3.2" /></>),
  undo: glyph('undo', <><path d="M8.5 5L4 9.5 8.5 14" /><path d="M4 9.5h10a6 6 0 0 1 0 12h-3" /></>),
  redo: glyph('redo', <><path d="M15.5 5L20 9.5 15.5 14" /><path d="M20 9.5H10a6 6 0 0 0 0 12h3" /></>),
  clock: glyph('clock', <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5.5l3.5 2" /></>),
  sun: glyph('sun', <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" /></>),
  pin: glyph('pin', <><path d="M12 21.5s-6.5-6.4-6.5-11.5a6.5 6.5 0 0 1 13 0c0 5.1-6.5 11.5-6.5 11.5z" /><path d="M10 8h4v3h-4z" /></>),
  home: glyph('home', <><path d="M3.5 11L12 3.5l8.5 7.5" /><path d="M5.5 9.5v11h13v-11" /><path d="M10 20.5v-6h4v6" /></>),
  star: glyph('star', <><path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6-4.5-4.2 6.1-.7z" /></>),
  water: glyph('water', <><path d="M2.5 9c2 0 2-1.5 4.75-1.5S10 9 12 9s2.25-1.5 4.75-1.5S19.5 9 21.5 9" /><path d="M2.5 15c2 0 2-1.5 4.75-1.5S10 15 12 15s2.25-1.5 4.75-1.5S19.5 15 21.5 15" /></>),
  note: glyph('note', <><path d="M5 3.5h10l4 4v13H5z" /><path d="M14.5 3.5v4.5H19" /><path d="M8.5 12.5h7M8.5 16h5" /></>),
  bulb: glyph('bulb', <><path d="M9 17.5h6M10 20.5h4" /><path d="M8 14.5a6 6 0 1 1 8 0c-.8.7-1 1.5-1 3H9c0-1.5-.2-2.3-1-3z" /></>),
  import: glyph('import', <><path d="M12 14V3" /><path d="M7.5 9.5L12 14l4.5-4.5" /><path d="M3.5 14v6.5h17V14" /></>),
  ask: glyph('ask', <><path d="M3.5 4.5h17v11h-9l-5 4.5v-4.5h-3z" /><path d="M8 9.5h8M8 12.5h5" /></>),
  bell: glyph('bell', <><path d="M6 17.5V11a6 6 0 0 1 12 0v6.5" /><path d="M4 17.5h16" /><path d="M10 20.5h4" /></>),
  gauge: glyph('gauge', <><path d="M3.5 17a8.5 8.5 0 1 1 17 0" /><path d="M12 17l4-5" /></>),
  send: glyph('send', <><path d="M12 20.5V4" /><path d="M5.5 10.5L12 4l6.5 6.5" /></>),
  // G12 (explore polish): the Trip dock's mark, a plane over two slider
  // lines with their knobs; not a gear. Its parts carry classes so the dock
  // can glide the plane and swap the knobs when it opens (89-dock.css).
  tune: glyph('tune', <>
    <g className="tune-plane"><path d="M3 8.2l4.6-1 3-4.2h1.4L10.6 7l3.2.3 1-1.3h1l-.6 2.2.6 2.2h-1l-1-1.3-3.2.3 1.4 4.2h-1.4l-3-4.2L3 9.4z" fill="currentColor" stroke="none" /></g>
    <path className="tune-rail" d="M3 15h18M3 20h18" />
    <g className="tune-k1"><circle cx="8" cy="15" r="2.2" /></g>
    <g className="tune-k2"><circle cx="16" cy="20" r="2.2" fill="currentColor" /></g>
  </>),
  // A return flight: two opposed arrows (the flight wagon's return mark).
  ret: glyph('ret', <><path d="M4 8h14.5" /><path d="M15.5 4.5L19 8l-3.5 3.5" /><path d="M20 16H5.5" /><path d="M8.5 12.5L5 16l3.5 3.5" /></>),
  // Save (the cairn stays My trips): a ribbon; .is-filled fills it when on.
  bookmark: glyph('bookmark', <><path className="bm-fill" d="M6 3.5h12v17l-6-4.2-6 4.2z" /></>),
};
