import React from 'react';

/**
 * Simplified inline-SVG country flags (3:2), sized for tiny UI tiles - saved
 * trip cards, wizard chips. Deliberately reduced: at 15 px a coat of arms is
 * noise, so complex emblems become their dominant shapes. SVG (not emoji
 * flags) per the app's icon rules - and emoji flags don't render on Windows.
 */

// Horizontal stripes, top to bottom. h = relative heights (default equal).
const H = (colors, h) => ({ kind: 'h', colors, h });
// Vertical stripes, left to right.
const V = (colors, w) => ({ kind: 'v', colors, w });
// Nordic cross: field colour, cross colour (plus optional inner cross).
const NORDIC = (field, cross, inner) => ({ kind: 'nordic', field, cross, inner });

const FLAGS = {
  AL: { kind: 'emblem', field: '#e41e20', draw: (k) => ( // black double-eagle silhouette
    <path key={k} d="M30 8 L22 14 L26 16 L18 20 L24 22 L20 28 L30 24 L40 28 L36 22 L42 20 L34 16 L38 14 Z" fill="#000" />
  ) },
  AD: V(['#10069f', '#fedd00', '#d50032'], [8, 9, 8]),
  AT: H(['#ed2939', '#fff', '#ed2939']),
  BA: { kind: 'emblem', field: '#002f6c', draw: (k) => (
    <g key={k}><path d="M22 0 L48 0 L48 40 Z" fill="#fecb00" />
    {[4, 11, 18, 25, 32].map((y, i) => <circle key={i} cx={19 + i * 6.5} cy={y} r="1.8" fill="#fff" />)}</g>
  ) },
  BE: V(['#000', '#fdda24', '#ef3340']),
  BG: H(['#fff', '#00966e', '#d62612']),
  CH: { kind: 'emblem', field: '#da291c', square: true, draw: (k) => (
    <path key={k} d="M26 12 h8 v8 h8 v8 h-8 v8 h-8 v-8 h-8 v-8 h8 Z" fill="#fff" />
  ) },
  CY: { kind: 'emblem', field: '#fff', draw: (k) => (
    <ellipse key={k} cx="30" cy="18" rx="14" ry="6" fill="#d47600" />
  ) },
  CZ: { kind: 'emblem', field: null, draw: (k) => (
    <g key={k}><rect width="60" height="20" fill="#fff" /><rect y="20" width="60" height="20" fill="#d7141a" />
    <path d="M0 0 L30 20 L0 40 Z" fill="#11457e" /></g>
  ) },
  DE: H(['#000', '#dd0000', '#ffce00']),
  DK: NORDIC('#c8102e', '#fff'),
  EE: H(['#0072ce', '#000', '#fff']),
  ES: H(['#aa151b', '#f1bf00', '#aa151b'], [10, 20, 10]),
  FI: NORDIC('#fff', '#002f6c'),
  FO: NORDIC('#fff', '#ef3340', '#0065bd'),
  FR: V(['#002395', '#fff', '#ed2939']),
  GB: { kind: 'emblem', field: '#012169', draw: (k) => (
    <g key={k}>
      <path d="M0 0 L60 40 M60 0 L0 40" stroke="#fff" strokeWidth="8" />
      <path d="M0 0 L60 40 M60 0 L0 40" stroke="#c8102e" strokeWidth="3" />
      <path d="M30 0 V40 M0 20 H60" stroke="#fff" strokeWidth="13" />
      <path d="M30 0 V40 M0 20 H60" stroke="#c8102e" strokeWidth="7" />
    </g>
  ) },
  GR: { kind: 'emblem', field: null, draw: (k) => (
    <g key={k}>
      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
        <rect key={i} y={i * (40 / 9)} width="60" height={40 / 9} fill={i % 2 ? '#fff' : '#004c98'} />
      ))}
      <rect width="22" height="22" fill="#004c98" />
      <path d="M11 0 V22 M0 11 H22" stroke="#fff" strokeWidth="4.5" />
    </g>
  ) },
  HR: { kind: 'emblem', field: null, draw: (k) => (
    <g key={k}><rect width="60" height="13.3" fill="#ff0000" /><rect y="13.3" width="60" height="13.3" fill="#fff" />
    <rect y="26.6" width="60" height="13.4" fill="#171796" />
    {[0, 1, 2, 3].map((r) => [0, 1, 2, 3].map((c) => (((r + c) % 2 === 0)
      ? <rect key={`${r}${c}`} x={22 + c * 4} y={12 + r * 4} width="4" height="4" fill="#ff0000" />
      : <rect key={`${r}${c}`} x={22 + c * 4} y={12 + r * 4} width="4" height="4" fill="#fff" />)))}</g>
  ) },
  HU: H(['#ce2939', '#fff', '#477050']),
  IE: V(['#169b62', '#fff', '#ff883e']),
  IS: NORDIC('#02529c', '#fff', '#dc1e35'),
  IT: V(['#009246', '#fff', '#ce2b37']),
  LI: { kind: 'emblem', field: null, draw: (k) => (
    <g key={k}><rect width="60" height="20" fill="#002b7f" /><rect y="20" width="60" height="20" fill="#ce1126" />
    <circle cx="12" cy="10" r="4" fill="#ffd83d" /></g>
  ) },
  LT: H(['#fdb913', '#006a44', '#c1272d']),
  LU: H(['#ed2939', '#fff', '#00a1de']),
  LV: H(['#9e3039', '#fff', '#9e3039'], [16, 8, 16]),
  MC: H(['#ce1126', '#fff']),
  MD: { kind: 'emblem', field: null, draw: (k) => (
    <g key={k}><rect width="20" height="40" fill="#0046ae" /><rect x="20" width="20" height="40" fill="#ffd200" />
    <rect x="40" width="20" height="40" fill="#cc092f" /><circle cx="30" cy="20" r="6" fill="#a77b3b" /></g>
  ) },
  ME: { kind: 'emblem', field: '#c40308', draw: (k) => (
    <g key={k}><rect x="2" y="2" width="56" height="36" fill="none" stroke="#d4af37" strokeWidth="4" />
    <circle cx="30" cy="20" r="7" fill="#d4af37" /></g>
  ) },
  MK: { kind: 'emblem', field: '#d20000', draw: (k) => (
    <g key={k}><circle cx="30" cy="20" r="7" fill="#ffe600" />
    <path d="M30 20 L0 0 M30 20 L60 0 M30 20 L0 40 M30 20 L60 40 M30 20 L30 0 M30 20 L30 40 M30 20 L0 20 M30 20 L60 20"
      stroke="#ffe600" strokeWidth="5" /></g>
  ) },
  MT: { kind: 'emblem', field: null, draw: (k) => (
    <g key={k}><rect width="30" height="40" fill="#fff" /><rect x="30" width="30" height="40" fill="#cf142b" /></g>
  ) },
  NL: H(['#ae1c28', '#fff', '#21468b']),
  NO: NORDIC('#ba0c2f', '#fff', '#00205b'),
  PL: H(['#fff', '#dc143c']),
  PT: { kind: 'emblem', field: null, draw: (k) => (
    <g key={k}><rect width="24" height="40" fill="#046a38" /><rect x="24" width="36" height="40" fill="#da291c" />
    <circle cx="24" cy="20" r="7" fill="#ffe900" /></g>
  ) },
  RO: V(['#002b7f', '#fcd116', '#ce1126']),
  RS: H(['#c6363c', '#0c4076', '#fff']),
  SE: NORDIC('#006aa7', '#fecc02'),
  SI: { kind: 'emblem', field: null, draw: (k) => (
    <g key={k}><rect width="60" height="13.3" fill="#fff" /><rect y="13.3" width="60" height="13.3" fill="#005ce5" />
    <rect y="26.6" width="60" height="13.4" fill="#ed1c24" />
    <path d="M14 8 L19 16 L9 16 Z" fill="#005ce5" stroke="#fff" strokeWidth="1" /></g>
  ) },
  SK: { kind: 'emblem', field: null, draw: (k) => (
    <g key={k}><rect width="60" height="13.3" fill="#fff" /><rect y="13.3" width="60" height="13.3" fill="#0b4ea2" />
    <rect y="26.6" width="60" height="13.4" fill="#ee1c25" />
    <path d="M14 10 h12 v10 q0 8 -6 11 q-6 -3 -6 -11 Z" fill="#ee1c25" stroke="#fff" strokeWidth="1.5" /></g>
  ) },
  SM: { kind: 'emblem', field: null, draw: (k) => (
    <g key={k}><rect width="60" height="20" fill="#fff" /><rect y="20" width="60" height="20" fill="#5eb6e4" /></g>
  ) },
  XK: { kind: 'emblem', field: '#244aa5', draw: (k) => (
    <g key={k}><path d="M24 14 Q26 10 30 12 Q34 10 36 14 Q38 20 34 26 L26 26 Q22 20 24 14 Z" fill="#d0a650" />
    {[0, 1, 2, 3, 4, 5].map((i) => <circle key={i} cx={17 + i * 5.2} cy="8" r="1.6" fill="#fff" />)}</g>
  ) },
};

// Country display name (as stored on destinations / trip stops) -> ISO2.
export const COUNTRY_ISO2 = {
  Albania: 'AL', Andorra: 'AD', Austria: 'AT', 'Bosnia and Herzegovina': 'BA',
  Belgium: 'BE', Bulgaria: 'BG', Switzerland: 'CH', Cyprus: 'CY', Czechia: 'CZ',
  'Czech Republic': 'CZ', Germany: 'DE', Denmark: 'DK', Estonia: 'EE',
  Spain: 'ES', Finland: 'FI', 'Faroe Islands': 'FO', France: 'FR',
  'United Kingdom': 'GB', Greece: 'GR', Croatia: 'HR', Hungary: 'HU',
  Ireland: 'IE', Iceland: 'IS', Italy: 'IT', Liechtenstein: 'LI',
  Lithuania: 'LT', Luxembourg: 'LU', Latvia: 'LV', Monaco: 'MC', Moldova: 'MD',
  Montenegro: 'ME', 'North Macedonia': 'MK', Malta: 'MT', Netherlands: 'NL',
  Norway: 'NO', Poland: 'PL', Portugal: 'PT', Romania: 'RO', Serbia: 'RS',
  Sweden: 'SE', Slovenia: 'SI', Slovakia: 'SK', 'San Marino': 'SM', Kosovo: 'XK',
};

function renderFlag(def) {
  if (!def) return null;
  if (def.kind === 'h') {
    const hs = def.h || def.colors.map(() => 40 / def.colors.length);
    const total = hs.reduce((a, b) => a + b, 0);
    let y = 0;
    return def.colors.map((c, i) => {
      const hh = (hs[i] / total) * 40;
      const r = <rect key={i} y={y} width="60" height={hh} fill={c} />;
      y += hh;
      return r;
    });
  }
  if (def.kind === 'v') {
    const ws = def.w || def.colors.map(() => 60 / def.colors.length);
    const total = ws.reduce((a, b) => a + b, 0);
    let x = 0;
    return def.colors.map((c, i) => {
      const ww = (ws[i] / total) * 60;
      const r = <rect key={i} x={x} width={ww} height="40" fill={c} />;
      x += ww;
      return r;
    });
  }
  if (def.kind === 'nordic') {
    return (
      <g>
        <rect width="60" height="40" fill={def.field} />
        <path d="M22 0 V40 M0 20 H60" stroke={def.cross} strokeWidth={def.inner ? 11 : 8} />
        {def.inner && <path d="M22 0 V40 M0 20 H60" stroke={def.inner} strokeWidth="5" />}
      </g>
    );
  }
  if (def.kind === 'emblem') {
    return (
      <g>
        {def.field && <rect width="60" height="40" fill={def.field} />}
        {def.draw('e')}
      </g>
    );
  }
  return null;
}

/** One flag. `country` may be a display name or an ISO2 code. */
export function CountryFlag({ country, size = 15, className = '' }) {
  const iso2 = (COUNTRY_ISO2[country] || country || '').toUpperCase();
  const def = FLAGS[iso2];
  if (!def) return null;
  return (
    <svg
      className={`country-flag ${className}`}
      width={size * 1.35}
      height={size * 0.9}
      viewBox="0 0 60 40"
      role="img"
      aria-label={`Flag of ${country}`}
      preserveAspectRatio="xMidYMid slice"
    >
      {renderFlag(def)}
    </svg>
  );
}

/** A compact stack of up to three country flags (a multi-country trip). */
export function CountryFlagStack({ countries = [], size = 15 }) {
  const unique = [...new Set(countries.filter(Boolean))].slice(0, 3);
  if (!unique.length) return null;
  return (
    <span className={`country-flag-stack n${unique.length}`}>
      {unique.map((c) => <CountryFlag key={c} country={c} size={size} />)}
    </span>
  );
}
