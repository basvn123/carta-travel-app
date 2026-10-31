/**
 * friendsMock.js, the ?friendsmock dev seam (T928 to T932).
 *
 * Same precedent as ?savedmock, ?coplanmock and ?guidesmock: fixtures stand
 * in for the friend RPCs and the group trip tables so every state of the
 * Together page renders without an account, before migrations 055 and 056
 * are applied, and in headless checks. Display only: never on unless typed,
 * and never in a production build (E2E_SEAMS).
 *
 * What it holds: a friend request (Lea), a co-plan invite and a group invite,
 * three friends with shown trips (Sam, Jo, Ana), an overlap (Sam in Lisbon on
 * the days of your own Lisbon stay), a group trip with votes and a band, and
 * Sam's shares (countries, saves and a tip for friends; never a cost).
 * ?friendsmock=empty is an account with nobody yet.
 */
import { E2E_SEAMS } from '../lib/e2eSeams.js';

export const FRIENDS_MOCK = E2E_SEAMS && typeof window !== 'undefined'
  ? new URLSearchParams(window.location.search).get('friendsmock')
  : null;
export const IS_FRIENDS_MOCK = FRIENDS_MOCK !== null;

export const MOCK_ME = 'u-me';

function addDaysIso(n) {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function mockState() {
  const empty = FRIENDS_MOCK === 'empty';
  const d = addDaysIso;
  const links = empty ? [] : [
    { id: 'l-lea', kind: 'incoming', userId: 'u-lea', handle: 'lea_d', displayName: 'Léa Dubois', avatarEmoji: '', createdAt: d(-1) },
    { id: 'l-sam', kind: 'friend', userId: 'u-sam', handle: 'sam_m', displayName: 'Sam Martens', avatarEmoji: '', createdAt: d(-90) },
    { id: 'l-jo', kind: 'friend', userId: 'u-jo', handle: 'jo_p', displayName: 'Jo Peeters', avatarEmoji: '', createdAt: d(-60) },
    { id: 'l-ana', kind: 'friend', userId: 'u-ana', handle: 'ana_r', displayName: 'Ana Rocha', avatarEmoji: '', createdAt: d(-30) },
  ];
  const friendTrips = empty ? [] : [
    { ownerId: 'u-sam', ownerHandle: 'sam_m', ownerName: 'Sam Martens', ownerEmoji: '', tripPlanId: 'ft-sam-lis', label: 'Lisbon long weekend', startDate: d(22), endDate: d(25), cities: ['Lisbon'], countries: ['Portugal'], destinationIds: ['LIS'], updatedAt: d(-2) },
    { ownerId: 'u-sam', ownerHandle: 'sam_m', ownerName: 'Sam Martens', ownerEmoji: '', tripPlanId: 'ft-sam-hr', label: 'Croatia coast', startDate: d(180), endDate: d(187), cities: ['Split', 'Dubrovnik'], countries: ['Croatia'], destinationIds: ['SPU', 'DBV'], updatedAt: d(-5) },
    { ownerId: 'u-sam', ownerHandle: 'sam_m', ownerName: 'Sam Martens', ownerEmoji: '', tripPlanId: 'ft-sam-opo', label: 'Porto in September', startDate: d(-410), endDate: d(-404), cities: ['Porto'], countries: ['Portugal'], destinationIds: ['OPO'], updatedAt: d(-400) },
    { ownerId: 'u-jo', ownerHandle: 'jo_p', ownerName: 'Jo Peeters', ownerEmoji: '', tripPlanId: 'ft-jo-be', label: 'Ghent and Bruges', startDate: d(300), endDate: d(306), cities: ['Ghent', 'Bruges'], countries: ['Belgium'], destinationIds: ['gem:ghent', 'gem:bruges'], updatedAt: d(-9) },
    { ownerId: 'u-ana', ownerHandle: 'ana_r', ownerName: 'Ana Rocha', ownerEmoji: '', tripPlanId: 'ft-ana-at', label: 'Alps hut tour', startDate: d(250), endDate: d(256), cities: ['Innsbruck'], countries: ['Austria'], destinationIds: ['INN'], updatedAt: d(-20) },
  ];
  const shares = empty ? new Map() : new Map([
    ['u-sam', {
      showCountries: true, showSaves: true, showTips: true, showMeet: true,
      countries: ['Belgium', 'Netherlands', 'France', 'Portugal', 'Spain', 'Italy', 'Greece', 'Croatia', 'Denmark', 'Sweden'],
      saves: ['dest:OPO', 'dest:LJU', 'dest:BCN'],
      trips: new Map([
        ['ft-sam-opo', { stops: [], tip: 'Sit on the right side of the train out of Porto.' }],
        ['ft-sam-hr', { stops: [
          { destination_id: 'SPU', city: 'Split', arrive_date: d(180), depart_date: d(184) },
          { destination_id: 'DBV', city: 'Dubrovnik', arrive_date: d(184), depart_date: d(187) },
        ], tip: null }],
      ]),
    }],
    ['u-jo', {
      showCountries: true, showSaves: true, showTips: true, showMeet: true,
      countries: ['Belgium', 'Netherlands', 'Germany'], saves: ['dest:OPO'], trips: new Map(),
    }],
    ['u-ana', {
      showCountries: false, showSaves: false, showTips: true, showMeet: true,
      countries: [], saves: [], trips: new Map(),
    }],
  ]);
  // Your own trip plans: a Lisbon then Porto trip that meets Sam in Lisbon.
  const myPlans = [
    { id: 'mp1', label: null, user_id: MOCK_ME, cities: ['Lisbon', 'Porto'], countries: ['Portugal'], start_date: d(21), end_date: d(27), destination_ids: ['LIS', 'OPO'],
      stops: [
        { destination_id: 'LIS', city: 'Lisbon', country: 'Portugal', arrive_date: d(21), depart_date: d(24) },
        { destination_id: 'OPO', city: 'Porto', country: 'Portugal', arrive_date: d(24), depart_date: d(27) },
      ] },
    { id: 'mp-past', label: 'Slovenian lakes', user_id: MOCK_ME, cities: ['Ljubljana'], countries: ['Slovenia'], start_date: d(-200), end_date: d(-195), destination_ids: ['LJU'],
      stops: [{ destination_id: 'LJU', city: 'Ljubljana', country: 'Slovenia', arrive_date: d(-200), depart_date: d(-195) }] },
  ];
  const invites = empty ? [] : [{
    tripPlanId: 'ft-jo-wk', label: 'Weekend in Ghent', ownerHandle: 'jo_p', ownerName: 'Jo Peeters',
    cities: ['Ghent'], countries: ['Belgium'], status: 'pending', createdAt: d(-1),
  }];
  const groups = empty ? [] : [
    {
      id: 'g-summer', title: 'Summer 2027', ownerId: MOCK_ME, bookedPlanId: null, myStatus: 'joined',
      members: [
        { userId: MOCK_ME, status: 'joined', handle: 'bas_v', name: 'Bas', emoji: '' },
        { userId: 'u-sam', status: 'joined', handle: 'sam_m', name: 'Sam Martens', emoji: '' },
        { userId: 'u-jo', status: 'joined', handle: 'jo_p', name: 'Jo Peeters', emoji: '' },
      ],
      options: [
        { id: 'o-w1', kind: 'when', start: d(210), end: d(217) },
        { id: 'o-w2', kind: 'when', start: d(224), end: d(231) },
        { id: 'o-w3', kind: 'when', start: d(245), end: d(252) },
        { id: 'o-p1', kind: 'where', destId: 'SPU' },
        { id: 'o-p2', kind: 'where', destId: 'LJU' },
        { id: 'o-p3', kind: 'where', destId: 'FAO' },
      ],
      votes: [
        { kind: 'when', userId: 'u-sam', optionId: 'o-w1' },
        { kind: 'when', userId: 'u-jo', optionId: 'o-w2' },
        { kind: 'where', userId: 'u-sam', optionId: 'o-p1' },
        { kind: 'where', userId: 'u-jo', optionId: 'o-p2' },
      ],
      myBudget: 130,
      // What group_trip_band() would answer for budgets of 130, 104 and 150.
      band: { top: 100, set: 3, members: 3, ready: true },
    },
    {
      id: 'g-autumn', title: 'Autumn walk', ownerId: 'u-ana', bookedPlanId: null, myStatus: 'invited',
      members: [
        { userId: 'u-ana', status: 'joined', handle: 'ana_r', name: 'Ana Rocha', emoji: '' },
        { userId: MOCK_ME, status: 'invited', handle: 'bas_v', name: 'Bas', emoji: '' },
      ],
      options: [], votes: [], myBudget: null, band: { top: null, set: 0, members: 1, ready: false },
    },
  ];
  return {
    me: { handle: 'bas_v', displayName: 'Bas', avatarEmoji: '' },
    links,
    friendTrips,
    shares,
    myPlans,
    invites,
    groups,
    groupsMissing: false,
    visibility: { showCountries: true, showSaves: false, showTips: true, showMeet: true },
    visibilityMissing: false,
    // Your own record and shortlist as the seam has them (the real ones are
    // this browser's visited countries and the App's favorites).
    mockVisited: ['Belgium', 'Netherlands', 'France', 'Germany', 'Austria', 'Italy', 'Spain', 'Czechia'],
    mockSaves: ['dest:OPO', 'dest:LJU'],
    // Accepted co-planners on your own trips, for My trips' "Sam joins".
    coplannersByPlan: { mp1: [{ userId: 'u-sam', name: 'Sam Martens', emoji: '' }] },
  };
}

/** A profile the seam's Find answers with. */
export function mockFind(handle) {
  if (handle === 'mia_k') return { userId: 'u-mia', handle: 'mia_k', displayName: 'Mia Kovač', avatarEmoji: '' };
  return null;
}
