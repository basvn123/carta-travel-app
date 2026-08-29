/**
 * guides.js, the plans people have published.
 *
 * This is the one browsable surface in the social layer, and the reason it is
 * allowed to exist alongside migration 011's flat refusal to let anybody
 * browse anybody is that WHAT IS BROWSABLE HERE IS A DOCUMENT, NOT A PERSON.
 * An author flips one trip to 'public' and it appears under their handle.
 * There is still no way to list accounts, search names, or walk the graph:
 * you can read what somebody published and nothing else about them.
 *
 * It is also the only part of this layer that does anything at all for an
 * account with no friends, which is most accounts on their first day. A feed
 * of your friends is empty until you have friends; a gallery of guides is
 * full from the first visit, and reading one is what makes signing up worth
 * doing. That is the growth loop, and it is the same one the badges already
 * measure: publish, get opened, somebody arrives.
 *
 * Every read goes through a security definer RPC (migration 019). The
 * projections there are strict narrowings of the ones a friend gets, so a
 * public guide can never carry more than a friend's copy of the same trip:
 * no exact dates, no crew, no spend.
 */
import { supabase } from '../lib/supabaseClient.js';

/* ---- the verify seam ------------------------------------------------------
 * Same precedent as ?savedmock, ?sharemock and ?badgemock: a fixture stands
 * in for the RPCs so the gallery can be checked headlessly and so the surface
 * can be looked at before migration 019 is applied. Display only, never on
 * unless typed. */
const MOCK = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('guidesmock');

const MOCK_GUIDES = [
  {
    tripPlanId: 'guide-1', ownerHandle: 'sofie_v', ownerName: 'Sofie Vermeulen', ownerEmoji: '',
    label: 'Four days of canals and beer', cities: ['Ghent', 'Bruges'], countries: ['Belgium'],
    destinationIds: ['GNE', 'BRG'], months: [9], nightsTotal: 4,
    publishedAt: '2026-08-24T09:00:00Z',
  },
  {
    tripPlanId: 'guide-2', ownerHandle: 'jonas', ownerName: 'Jonas Peeters', ownerEmoji: '',
    label: 'Lisbon on foot', cities: ['Lisbon'], countries: ['Portugal'],
    destinationIds: ['LIS'], months: [5], nightsTotal: 5,
    publishedAt: '2026-08-19T09:00:00Z',
  },
  {
    tripPlanId: 'guide-3', ownerHandle: 'ana_r', ownerName: 'Ana Rocha', ownerEmoji: '',
    label: 'Three cities by train', cities: ['Porto', 'Coimbra', 'Braga'], countries: ['Portugal'],
    destinationIds: ['OPO', 'CBA', 'BRA'], months: [4, 5], nightsTotal: 7,
    publishedAt: '2026-08-11T09:00:00Z',
  },
];

const MOCK_ONE = {
  tripPlanId: 'guide-1', ownerHandle: 'sofie_v', ownerName: 'Sofie Vermeulen', ownerEmoji: '',
  label: 'Four days of canals and beer',
  publishedAt: '2026-08-24T09:00:00Z',
  stops: [
    { position: 0, destination_id: 'GNE', city: 'Ghent', country: 'Belgium', month: 9, nights: 2 },
    { position: 1, destination_id: 'BRG', city: 'Bruges', country: 'Belgium', month: 9, nights: 2 },
  ],
  payload: {
    extras: {
      memory: {
        v: 1,
        story: 'Go on a weekday. The canal boats queue for an hour on a Saturday and not at all on a Tuesday.',
        places: [{ id: 'GNE', city: 'Ghent', country: 'Belgium', lat: 51.05, lon: 3.72, nights: 2 }],
        highlights: ['Gravensteen at opening time', 'The Friday market'],
      },
    },
  },
};

function rowToGuide(r) {
  return {
    tripPlanId: r.trip_plan_id,
    ownerHandle: r.owner_handle,
    ownerName: r.owner_name || '',
    ownerEmoji: r.owner_emoji || '',
    label: r.label || '',
    cities: r.cities || [],
    countries: r.countries || [],
    destinationIds: r.destination_ids || [],
    months: (r.months || []).filter(Boolean).sort((a, b) => a - b),
    nightsTotal: r.nights_total || 0,
    publishedAt: r.published_at || null,
  };
}

/**
 * The gallery, newest published first.
 *
 * Returns [] rather than throwing when the project has no migration 019 yet,
 * for the same reason the badge ledger returns null: a traveller can do
 * nothing about a missing function, and a surface that cannot know what is
 * published should say nothing rather than say "nothing".
 */
export async function listGuides({ country = null, limit = 60, skip = 0 } = {}) {
  if (MOCK) {
    const rows = MOCK === 'none' ? [] : MOCK_GUIDES;
    return country ? rows.filter((g) => g.countries.includes(country)) : rows;
  }
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('list_public_guides', {
    wanted_country: country, max_rows: limit, skip,
  });
  if (error) {
    console.warn('[guides] the gallery could not be read:', error.message || error);
    return [];
  }
  return (data || []).map(rowToGuide);
}

/** One published guide in full, or null when it was unpublished between the
 *  gallery and the tap. */
export async function getGuide(planId) {
  if (MOCK) return planId === MOCK_ONE.tripPlanId ? MOCK_ONE : { ...MOCK_ONE, tripPlanId: planId };
  if (!supabase || !planId) return null;
  const { data, error } = await supabase.rpc('get_public_guide', { wanted_plan: planId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    tripPlanId: row.trip_plan_id,
    ownerHandle: row.owner_handle,
    ownerName: row.owner_name || '',
    ownerEmoji: row.owner_emoji || '',
    label: row.label || '',
    publishedAt: row.published_at || null,
    stops: Array.isArray(row.stops) ? row.stops : [],
    payload: row.payload && typeof row.payload === 'object' ? row.payload : {},
  };
}

/**
 * Report that somebody read it, so the author's local_guide badge can be
 * awarded by the database. Fire and forget on purpose: this is bookkeeping
 * for somebody else, and a reader must never see it fail.
 */
export function reportGuideOpened(planId) {
  if (MOCK || !supabase || !planId) return;
  supabase.rpc('public_guide_opened', { wanted_plan: planId })
    .then(({ error }) => {
      if (error) console.warn('[guides] could not record the open:', error.message || error);
    });
}

/* ---- describing one ------------------------------------------------------ */

/** Months as a phrase the reader can act on: "September", "April to May", or
 *  nothing when the author's plan carries no dates at all. A month is a
 *  season; the exact nights never leave the author's account. */
export function fmtMonths(months, lang, joiner = 'to') {
  const list = (months || []).filter((m) => m >= 1 && m <= 12).sort((a, b) => a - b);
  if (!list.length) return '';
  const name = (m) => new Intl.DateTimeFormat(lang, { month: 'long' })
    .format(new Date(Date.UTC(2026, m - 1, 1)));
  if (list.length === 1) return name(list[0]);
  return `${name(list[0])} ${joiner} ${name(list[list.length - 1])}`;
}

/** The route as one line: one city, or the first and how many follow. */
export function fmtRoute(cities) {
  const list = (cities || []).filter(Boolean);
  if (!list.length) return '';
  if (list.length <= 2) return list.join(', ');
  return `${list[0]}, ${list[1]} +${list.length - 2}`;
}

/** Where a guide can be linked to directly, in the hash like every other link
 *  this app hands out, so the plan id never reaches a server log. */
export const GUIDE_PARAM = 'guide';

export function buildGuideUrl(planId) {
  if (!planId || typeof window === 'undefined') return null;
  return `${window.location.origin}${window.location.pathname}#${GUIDE_PARAM}=${planId}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The guide id in the current URL, or null. Shape-checked so a tampered
 *  link cannot reach the RPC at all. */
export function readGuideIdFromUrl() {
  if (typeof window === 'undefined') return null;
  const hash = (window.location.hash || '').replace(/^#/, '');
  if (!hash.includes(`${GUIDE_PARAM}=`)) return null;
  const id = new URLSearchParams(hash).get(GUIDE_PARAM);
  if (MOCK && id) return id;
  return UUID_RE.test(id || '') ? id : null;
}

/** Strips our param without disturbing the rest of the hash or the history. */
export function stripGuideIdFromUrl() {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
  params.delete(GUIDE_PARAM);
  const rest = params.toString();
  window.history.replaceState(
    null,
    '',
    `${window.location.pathname}${window.location.search}${rest ? `#${rest}` : ''}`,
  );
}
