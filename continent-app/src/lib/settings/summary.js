/**
 * The Settings summary (G12, D10): the five chips under Explore's tabs on a
 * phone and the status line under the search on a desktop, in order: style,
 * start, when, way, prices. Each item carries its FULL text (the approved
 * decision: no ellipsis, no cut words), an icon name the band maps to its
 * glyph, and the Settings step it opens ('style' opens the Style Studio).
 *
 *   heart     "The two of us"            the style's name
 *   flag/pin  "From Belgium"             a country, or a town (here, place)
 *   calendar  "June, 7 nights" | "12 to 19 June" | "Any time, 7 nights"
 *             | "Cheapest dates, 7 nights"
 *   way       "By train" | "Best way"    icon is the mode ('route' for Best way)
 *   euro      "A day, each person" | "The whole trip, the group"
 *
 * Pure: the caller's `t`, and the language for month and country names
 * (Intl knows all six, lib/dates.js monthName, lib/countryName.js).
 */
import { asModel } from './prices.js';
import { monthName } from '../dates.js';
import { countryName } from '../countryName.js';
import { activeLocale } from '../localeState.js';

const nightsText = (t, n) => (n === 1 ? t('receipt.oneNight') : t('receipt.nNights', { n }));

function dayMonth(iso, lang, withMonth = true) {
  const d = new Date(`${iso}T12:00:00Z`);
  try {
    return new Intl.DateTimeFormat(lang, withMonth ? { day: 'numeric', month: 'long', timeZone: 'UTC' } : { day: 'numeric', timeZone: 'UTC' }).format(d);
  } catch {
    return iso;
  }
}

/** "12 to 19 June", or "28 June to 5 July" across two months. */
export function datesText(t, start, end, lang = activeLocale()) {
  const same = start.slice(0, 7) === end.slice(0, 7);
  return t('settingsSum.dates', { from: dayMonth(start, lang, !same), to: dayMonth(end, lang) });
}

/** The When chip's text for a model. */
export function whenText(m, t, lang = activeLocale()) {
  const nights = nightsText(t, m.tripNights);
  if (m.dateMode === 'dates') return m.dates ? datesText(t, m.dates.start, m.dates.end, lang) : t('settingsSum.datesPick');
  if (m.dateMode === 'month') return t('settingsSum.month', { month: monthName(Number(m.month.slice(5, 7)), lang), nights });
  if (m.dateMode === 'cheapest') return t('settingsSum.cheapest', { nights });
  return t('settingsSum.any', { nights });
}

/** The Start chip's place name, or '' when nothing is known. */
export function startPlace(m, data, lang = activeLocale()) {
  if (m.originKind === 'country' && m.originCountry) return countryName(m.originCountry, '', lang);
  // fixes-r1 E7: the picked place's own name in the UI language, where the
  // gazetteer has one (Brussel, Bruxelles, Brüssel).
  const local = m.startNames?.[String(lang || '').slice(0, 2).toLowerCase()];
  if (local) return local;
  if (m.fromPlace?.name) return m.fromPlace.name;
  const o = data?.meta?.origins?.[m.origin];
  return o ? (o.city || o.name || '') : '';
}

const WAY_ICON = { any: 'route', plane: 'plane', train: 'train', bus: 'bus', car: 'car' };

/**
 * @param {object} choices  the Settings model (settings.model on the
 *   context) or raw choices
 * @param {object|null} style  the active travel style, or null
 * @param {Function} t  i18n
 * @param {{ lang?: string, data?: object }} [opts]
 * @returns {Array<{ key, icon, text, step }>}
 */
export function settingsSummary(choices, style, t, { lang = activeLocale(), data = null } = {}) {
  const m = asModel(choices);
  const styleName = style ? (style.name || (style.nameKey ? t(style.nameKey) : '')) : '';
  const place = startPlace(m, data, lang);
  const spanKey = m.priceSpan === 'trip' ? 'trip' : 'day';
  const viewKey = m.priceView === 'total' ? 'Group' : 'Pp';
  return [
    { key: 'style', icon: 'heart', text: styleName || t('settingsSum.styleNone'), step: 'style' },
    {
      key: 'start',
      icon: m.originKind === 'country' ? 'flag' : 'pin',
      text: place ? t('settingsSum.from', { place }) : t('settingsSum.startNone'),
      step: 'start',
    },
    { key: 'when', icon: 'calendar', text: whenText(m, t, lang), step: 'when' },
    { key: 'way', icon: WAY_ICON[m.way] || 'route', text: t(`settingsSum.way.${m.way}`), step: 'way' },
    { key: 'prices', icon: 'euro', text: t(`settingsSum.prices.${spanKey}${viewKey}`), step: 'prices' },
  ];
}
