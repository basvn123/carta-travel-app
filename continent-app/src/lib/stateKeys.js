/**
 * The one table of every address key and storage key Carta writes, with its
 * scope (logic wave 2, E9 phase A; ROADMAP C9, I5, I12, G12, G4).
 *
 * The audit found the same fact kept in four hand lists that drifted apart:
 * the keys the address writer owns (lib/urlState.js), the keys a share link
 * may carry (lib/shareKeys.js), the things a sign-out clears
 * (lib/deviceData.js, the Cookies page) and the keys the account sync
 * watches (auth/accountSync.js). Each of them now reads this table, and
 * tests/stateKeys.test.mjs fails on any `carta.*`, `continent.*` or address
 * key in src that is not named here.
 *
 * Plain data and small readers, no imports, so any module may read it.
 *
 * Scopes
 *   address keys   view      what is on screen; in the address, in a share link when `share`
 *                  person    the traveller's own choices (party, start, taste, shortlist)
 *                  seed      a hand-off read once at load (cc, dest, feat, deep links)
 *                  legacy    an old key a link may still carry; read-only or only cleared
 *                  preview   a developer or owner flag, never written by the app
 *                  external  a key another site sends, or one Carta puts on a link out
 *   storage keys   person    the traveller's things: cleared by "remove from this device"
 *                  setting   how the app looks and behaves; says nothing about the person
 *                  note      a one-off: a dismissed hint, a guard, a route cache
 *
 * `own: true`    persistState owns it: it replaces the key wholesale on every write.
 * `share: true`  a share-this-view link keeps it.
 * `place: true`  it names a place, not a setting: a link carrying only these is no
 *                one else's settings (isForeignLink in lib/urlState.js).
 * `strip: true`  person keys that go to the mirror (and the account) but, with
 *                flag E9 new, no longer ride in the address bar.
 * `sync`         'things' the account sync watches it for changes; 'settings' it
 *                travels inside the account's settings blob.
 */

const url = (key, scope, flags = {}) => ({ key, kind: 'url', scope, ...flags });
const store = (key, scope, flags = {}) => ({ key, kind: 'storage', scope, ...flags });

export const URL_KEYS = Object.freeze([
  // The place and its view.
  url('tab', 'view', { own: true, share: true, place: true }),
  url('mode', 'view', { own: true, place: true }),
  url('cat', 'view', { own: true, share: true, place: true }),
  url('view', 'view'),
  url('tv', 'view'),
  url('tg', 'view'),
  url('dc', 'view', { share: true }),
  url('dq', 'view', { share: true }),
  url('dm', 'view', { share: true }),
  url('dn', 'view'),
  // The dates and When, the way, the price view: view keys, but a link
  // that carried them would overwrite the recipient's own (shareKeys.js).
  url('d', 'view', { own: true }),
  url('r', 'view', { own: true }),
  url('df', 'view', { own: true }),
  url('wm', 'view', { own: true }),
  url('wy', 'view', { own: true }),
  url('wn', 'view', { own: true }),
  url('xm', 'view'),
  url('t', 'view', { own: true }),
  url('pv', 'view', { own: true }),
  url('ps', 'view', { own: true }),
  url('px', 'view', { own: true }),
  // The filters and Explore's lens.
  url('cf', 'view', { own: true, share: true }),
  url('cn', 'view', { own: true, share: true }),
  url('tk', 'view', { own: true, share: true }),
  url('sort', 'view', { own: true, share: true }),
  url('favonly', 'view', { own: true }),
  url('gem', 'view', { own: true, share: true }),
  url('un', 'view', { own: true, share: true }),
  url('rh', 'view', { own: true, share: true }),
  ...['xk', 'xv', 'xr', 'xb', 'xp', 'xe', 'xa', 'xn', 'xd', 'xg', 'xu', 'xw', 'xi', 'xall', 'xc', 'xo', 'xs']
    .map((k) => url(k, 'view', { share: true })),
  url('xq', 'view'),
  url('xy', 'view'),
  url('tt', 'view'),
  // Filters with no chip on screen (audit E-3): old links and accounts still
  // carry them; flag E9 new stops reading them so they cannot narrow Explore.
  url('rr', 'legacy', { own: true, share: true }),
  url('tb', 'legacy', { own: true, share: true }),
  url('big', 'legacy', { own: true, share: true }),
  url('top', 'legacy', { own: true, share: true }),
  url('mt', 'legacy'),
  url('mb', 'legacy'),
  // Retired and no longer written; persistState still clears them from old addresses.
  url('pr', 'legacy', { own: true }),
  // The traveller's own choices. Party, start, bed and way price a link, so
  // they stay in the address; the home point, shortlist and taste do not
  // (strip), and no share link carries any of them.
  url('g', 'person', { own: true }),
  url('gc', 'person', { own: true }),
  url('gb', 'person', { own: true }),
  url('b', 'person', { own: true }),
  url('st', 'person', { own: true }),
  url('ls', 'person', { own: true }),
  url('o', 'person', { own: true }),
  url('oa', 'person', { own: true }),
  url('ah', 'person', { own: true }),
  url('sk', 'person', { own: true }),
  url('sc', 'person', { own: true }),
  url('sh', 'person', { own: true }),
  url('dh', 'person', { own: true, strip: true }),
  url('fav', 'person', { own: true, strip: true }),
  url('ty', 'person', { own: true, strip: true }),
  // Hand-offs read once at load, then dropped by the writer.
  url('cc', 'seed', { own: true }),
  url('dest', 'seed', { own: true }),
  url('feat', 'seed', { own: true }),
  ...['beach', 'bc', 'cycle', 'guide', 'itin', 'lake', 'lc', 'mc', 'mtn', 'region', 'tc', 'tour', 'trail', 'legal']
    .map((k) => url(k, 'seed')),
  // Developer and owner switches: read, never written. `pm` is the Pass
  // moment preview (pass/passMoment.js); it is no longer an own key, so the
  // writer leaves it standing (J-17).
  ...['pm', 'pic', 'link', 'receipt', 'home', 'styleguide', 'seedError', 'pricealerts',
    'accountmock', 'aiplanmock', 'badgemock', 'coplanmock', 'friendsmock', 'guidesmock',
    'paymock', 'savedmock', 'sharemock', 'uploadmock']
    .map((k) => url(k, 'preview')),
  // What other sites send or what Carta puts on a link out: the checkout
  // return, campaign tags and the partner links' own parameters.
  ...['pass', 'utm_source', 'utm_medium', 'u', 'campaign', 'cmp', 'pid', 'partner_id', 'marker', 'subId',
    'checkin', 'checkout', 'date_from', 'date_to', 'group_children', 'inboundDate', 'locale', 'waypoints']
    .map((k) => url(k, 'external')),
]);

export const STORAGE_KEYS = Object.freeze([
  // The traveller's things. Order and spelling follow the Cookies page.
  store('carta.savedLists.v1', 'person', { sync: 'settings' }),
  store('carta.visitedCountries.v1', 'person', { sync: 'settings' }),
  store('carta.trips.v1', 'person', { sync: 'things' }),
  store('carta.keptTrips.v1', 'person', { sync: 'things' }),
  store('carta.savedJourneys.v1', 'person', { sync: 'things' }),
  store('carta.deviceTrip.v1', 'person', { sync: 'things' }),
  store('carta.tripDraft.v1', 'person', { sync: 'things' }),
  store('carta.plannerDraft.v1', 'person', { sync: 'things' }),
  store('carta.dayplans.v1', 'person'),
  store('carta.dayplan.', 'person', { prefix: true }),
  store('carta.dayprefs.', 'person', { prefix: true }),
  store('carta.tripextras.', 'person', { prefix: true }),
  store('carta.booked.', 'person', { prefix: true }),
  store('carta.places.v1', 'person'),
  store('carta.discovered.v1', 'person'),
  store('carta.ask.chats.v1', 'person'),
  store('carta.mytrips.', 'person', { prefix: true }),
  store('carta.tripSkips.v1', 'person'),
  store('carta.together.', 'person', { prefix: true }),
  store('carta.friends.lastSeen', 'person'),
  store('carta.dayChat.v1:', 'person', { prefix: true }),
  // T1104: which account this device last synced with, and what was in sync.
  store('carta.accountSync.v1', 'person'),
  // T1152: the traveller's yes and no on their taste chips.
  store('carta.taste.v1', 'person', { sync: 'settings' }),
  // The address mirror: home point, shortlist, party, start, dates, filters.
  store('continent.state.v1', 'person'),
  store('carta.travelStyles.v1', 'person', { sync: 'settings' }),
  store('carta.pendingCoplan', 'person'),
  store('carta.ownFares', 'person'),
  store('carta.finderPlan.once', 'person'),
  store('carta.priceDropAsk.v1', 'person'),
  store('carta.dock.recent', 'person'),
  store('carta.search.recent', 'person'),
  store('carta.search.picked', 'person'),
  // Settings: say nothing about the person, so a sign-out keeps them.
  store('continent.lang.v1', 'setting'),
  store('carta.tripLength', 'setting'),
  store('carta.exploreStart.v1', 'setting'),
  store('carta.destFolds.v2', 'setting'),
  store('carta.cartaTrips.filters.v1', 'setting'),
  store('carta.dayDetail.v1', 'setting'),
  store('carta.dayOpen.v1', 'setting'),
  store('carta.savedTripsTab', 'setting'),
  store('carta.ask.onDevice.v1', 'setting'),
  store('carta.haptics.v1', 'setting'),
  store('carta.errorTracking', 'setting'),
  store('carta.minimal', 'setting'),
  store('carta.home', 'setting'),
  store('carta.cc', 'setting'),
  store('carta.hero-ladder.v1', 'setting'),
  store('carta.placeLinking', 'setting'),
  store('carta.shareReceipt', 'setting'),
  store('carta.savedmock.variant', 'setting'),
  store('carta.plan.place.v1', 'setting'),
  store('carta.plan.quickStart', 'setting'),
  store('carta.studio.explainer', 'setting'),
  // Left on the device by sign-out today. Review for wave 9: a price watch
  // and the taste inputs name the person (ROADMAP C9, I5).
  store('carta.watch.v1', 'setting'),
  store('carta.tasteInputs.v1', 'setting'),
  store('carta.kas.faces.v1', 'setting'),
  store('carta.lastTier.v1', 'setting'),
  // One-off notes: dismissed hints and banners, guards, a pending pass.
  store('carta.banner.dismissed.v1', 'note'),
  store('carta.installHintDismissed.v1', 'note'),
  store('carta.passExpiry.dismissed.v1', 'note'),
  store('carta.paywall.snooze.v1', 'note'),
  store('carta.paywall.softShown.v1', 'note'),
  store('carta.pm', 'note'),
  store('carta.pm.later.v1', 'note'),
  store('carta.pendingPass', 'note'),
  store('carta.firstResultSeen', 'note'),
  store('carta.spend.speechNotice.v1', 'note'),
  store('carta.splash.seen.v1', 'note'),
  store('continent.chunkReloaded.v1', 'note'),
  store('continent.preloadReloadAt.v1', 'note'),
  store('continent.homeSeen.v1', 'note'),
  store('continent.guestMode.v1', 'note'),
  store('carta.route.', 'note', { prefix: true }),
]);

const URL_BY_KEY = new Map(URL_KEYS.map((e) => [e.key, e]));
const keys = (list, test) => list.filter(test).map((e) => e.key);

/** The entry for an address key, or undefined. */
export const urlEntry = (key) => URL_BY_KEY.get(key);

/** The entry for a storage key (exact, or the prefix that covers it), or undefined. */
export function storageEntry(key) {
  if (typeof key !== 'string') return undefined;
  return STORAGE_KEYS.find((e) => (e.prefix ? key.startsWith(e.key) : key === e.key));
}

/** The scope of an address key (`kind: 'url'`) or storage key, or null when unclassified. */
export function scopeOf(key, kind = 'storage') {
  const e = kind === 'url' ? urlEntry(key) : storageEntry(key);
  return e ? e.scope : null;
}

/** Address keys persistState owns (replaced wholesale on every write). */
export const ownUrlKeys = () => keys(URL_KEYS, (e) => e.own).sort();

/** Address keys a share-this-view link keeps. */
export const shareViewKeys = () => keys(URL_KEYS, (e) => e.share);

/** Address keys that name the person (flag E9 new: of these, `stripUrlKeys` leave the address). */
export const personUrlKeys = () => keys(URL_KEYS, (e) => e.scope === 'person');
export const stripUrlKeys = () => keys(URL_KEYS, (e) => e.strip);

/** Address keys that carry a setting: what makes a link someone else's. */
export const settingUrlKeys = () => keys(URL_KEYS, (e) => e.own && !e.place && e.scope !== 'seed');

/** Old filter keys no chip shows (audit E-3); flag E9 new stops reading them. */
export const legacyFilterKeys = () => ['rr', 'mt', 'mb', 'tb', 'big', 'top'];

/** The storage keys and prefixes of the traveller's things, as deviceData.js lists them. */
export const deviceKeys = () => keys(STORAGE_KEYS, (e) => e.scope === 'person');

/** The storage keys the account sync watches for a change. */
export const syncKeys = () => keys(STORAGE_KEYS, (e) => e.sync === 'things');
