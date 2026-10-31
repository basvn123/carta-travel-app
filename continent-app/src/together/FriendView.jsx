import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { Button, IconButton } from '../components/ui/index.js';
import { MoreIcon } from '../components/Icons.jsx';
import { HeroImage } from '../components/HeroImage.jsx';
import { COUNTRY_ISO2 } from '../components/CountryFlag.jsx';
import { formatMoney } from '../lib/money.js';
import { parseFavKey } from '../lib/favorites.js';
import { loadVisitedCountries } from '../lib/visitedCountries.js';
import { useTogether, togetherActions, shareOf } from './useTogether.js';
import { ToneFace, Block, nameOf, firstName, fmtShort } from './parts.jsx';

/**
 * A friend's page (T930): their face, name and handle with "Invite to a
 * trip"; "You and Sam", a tile map of Europe in three colours from the
 * countries each side shows; "Sam in Portugal", their cost a day and tip for
 * a country you plan (only what they share); "You both saved" (only if they
 * share saves); "Next", their next shown trip. Remove and block sit in a
 * menu and are silent: the other side is never told.
 *
 * "Ask to join" is left out: Carta has no request to join somebody else's
 * trip yet (co-planning is by the owner's invitation only, 020 and 052).
 */

// A tile grid of Europe: [column, row] per country (the spec's layout).
const TILES = {
  IS: [0, 0], NO: [5, 0], SE: [6, 0], FI: [7, 0], IE: [1, 1], GB: [2, 1], DK: [5, 1], EE: [8, 1],
  NL: [4, 2], DE: [5, 2], PL: [6, 2], LT: [7, 2], LV: [8, 2], BE: [3, 3], LU: [4, 3], CZ: [5, 3],
  SK: [6, 3], FR: [3, 4], CH: [4, 4], AT: [5, 4], HU: [6, 4], RO: [7, 4], PT: [1, 5], ES: [2, 5],
  IT: [4, 5], SI: [5, 5], HR: [6, 5], RS: [7, 5], BG: [8, 5], BA: [6, 6], ME: [7, 6], MK: [8, 6],
  MT: [4, 7], AL: [7, 7], GR: [8, 7], CY: [10, 7],
};
const ISO_NAME = Object.fromEntries(Object.entries(COUNTRY_ISO2).map(([n, c]) => [c, n]));
/** The country's name in the reader's language, else its English name. */
function regionName(iso, lang) {
  try { return new Intl.DisplayNames([lang], { type: 'region' }).of(iso) || ISO_NAME[iso] || iso; } catch { return ISO_NAME[iso] || iso; }
}
const isoOfName = (n) => COUNTRY_ISO2[n] || (/^[A-Z]{2}$/.test(n || '') ? n : null);
const todayIso = () => new Date().toISOString().slice(0, 10);

function isosOfTrip(trip, destinations) {
  const out = new Set();
  for (const id of trip.destinationIds || trip.destination_ids || []) {
    const c = destinations?.[id]?.iso2;
    if (c) out.add(c);
  }
  for (const n of trip.countries || []) { const c = isoOfName(n); if (c) out.add(c); }
  return out;
}

function DuoMap({ you, them, name, t }) {
  const s = 44;
  const g = 5;
  const both = [...you].filter((c) => them.has(c));
  return (
    <div className="tg-duo">
      <svg viewBox={`0 0 ${11 * (s + g)} ${8 * (s + g)}`} role="img" aria-label={t('tg.duoLabel', { who: name })}>
        {Object.entries(TILES).map(([c, [x, y]]) => {
          const a = you.has(c);
          const b = them.has(c);
          const cls = a && b ? 'is-both' : a ? 'is-you' : b ? 'is-them' : 'is-none';
          return (
            <g key={c}>
              <rect className={cls} x={x * (s + g)} y={y * (s + g)} width={s} height={s} rx="9" />
              <text className={a || b ? 'is-on' : ''} x={x * (s + g) + s / 2} y={y * (s + g) + s / 2 + 6} textAnchor="middle">{c}</text>
            </g>
          );
        })}
      </svg>
      <div className="tg-leg">
        <span><i className="is-both" />{t('tg.legBoth', { n: both.length })}</span>
        <span><i className="is-you" />{t('tg.legYou', { n: you.size - both.length })}</span>
        <span><i className="is-them" />{t('tg.legThem', { who: name, n: them.size - both.length })}</span>
      </div>
    </div>
  );
}

function useMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); } };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc, true); };
  }, [open]);
  return { open, setOpen, ref };
}

export function FriendView({ back, headRef, friendId, destinations, costs, favorites, onGone, onPlanPlace }) {
  const { t, lang } = useI18n();
  const s = useTogether();
  const link = s.links.find((l) => l.userId === friendId && l.kind === 'friend');
  const more = useMenu();
  const invite = useMenu();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const share = shareOf(s, friendId);
  const today = todayIso();
  const theirTrips = useMemo(() => s.friendTrips.filter((tr) => tr.ownerId === friendId), [s.friendTrips, friendId]);
  const myOwn = useMemo(() => s.myPlans.filter((p) => !p.coplan), [s.myPlans]);

  const you = useMemo(() => {
    const set = new Set();
    for (const n of s.mockVisited || loadVisitedCountries()) { const c = isoOfName(n); if (c) set.add(c); }
    for (const p of myOwn) if (p.end_date && p.end_date < today) isosOfTrip(p, destinations).forEach((c) => set.add(c));
    return set;
  }, [myOwn, destinations, today, s.mockVisited]);
  const them = useMemo(() => {
    const set = new Set();
    if (share.showCountries) for (const n of share.countries) { const c = isoOfName(n); if (c) set.add(c); }
    for (const tr of theirTrips) if (tr.endDate && tr.endDate < today) isosOfTrip(tr, destinations).forEach((c) => set.add(c));
    return set;
  }, [share, theirTrips, destinations, today]);

  // A country you plan, and what this friend shows from there.
  const inCountry = useMemo(() => {
    const planned = new Set();
    for (const p of myOwn) if (!p.end_date || p.end_date >= today) isosOfTrip(p, destinations).forEach((c) => planned.add(c));
    for (const tr of theirTrips) {
      if (!tr.endDate || tr.endDate >= today) continue;
      const notes = share.trips.get(tr.tripPlanId) || {};
      const cost = share.showCosts && Number.isFinite(notes.dayCost) ? notes.dayCost : null;
      const tip = share.showTips && notes.tip ? notes.tip : null;
      if (cost == null && !tip) continue;
      const c = [...isosOfTrip(tr, destinations)].find((x) => planned.has(x));
      if (c) return { iso: c, trip: tr, cost, tip };
    }
    return null;
  }, [myOwn, theirTrips, share, destinations, today]);

  const bothSaved = useMemo(() => {
    const mine = new Set([...(favorites || []), ...(s.mockSaves || [])]);
    if (!share.showSaves || !mine.size) return [];
    return share.saves.filter((k) => mine.has(k)).map(parseFavKey)
      .filter((p) => p && p.kind === 'dest' && destinations?.[p.id]).slice(0, 4).map((p) => destinations[p.id]);
  }, [share, favorites, destinations, s.mockSaves]);

  const next = useMemo(() => theirTrips
    .filter((tr) => tr.endDate && tr.endDate >= today)
    .sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)))[0] || null, [theirTrips, today]);

  const invitable = myOwn.filter((p) => !p.end_date || p.end_date >= today).slice(0, 8);

  if (!link) {
    return (
      <div className="tg-page">
        <div className="tg-head is-sub">{back}<h1 className="tg-h1" ref={headRef} tabIndex={-1} data-focus-quiet="">{t('friends.title')}</h1></div>
        <p className="tg-muted">{t('tg.friendGone')}</p>
      </div>
    );
  }
  const name = nameOf(link);
  const who = firstName(name);
  const drop = (fn) => fn(link.id).then(onGone).catch(() => setError(t('friends.unavailable')));
  const inviteTo = (planId) => {
    invite.setOpen(false);
    togetherActions.inviteToTrip(planId, friendId)
      .then(() => setNotice(t('tg.invited', { who })))
      .catch((err) => setError(t(err?.code === 'ALREADY_ON_TRIP' ? 'tg.alreadyOnTrip' : 'friends.unavailable')));
  };
  const destOf = (tr) => (tr.destinationIds || []).map((id) => destinations?.[id]).find(Boolean);
  const dayOf = (d) => (d ? costs?.get?.(d.id)?.dayEur : null);

  return (
    <div className="tg-page">
      <div className="tg-head is-sub">{back}</div>
      <div className="tg-fhead">
        <ToneFace id={link.userId} name={name} emoji={link.avatarEmoji} size="lg" />
        <span className="tg-fhead-tx">
          <h1 className="tg-h1" ref={headRef} tabIndex={-1} data-focus-quiet="">{name}</h1>
          <span className="tg-muted">@{link.handle}</span>
        </span>
        <span className="tg-fhead-acts">
          {invitable.length > 0 && (
            <span className="tg-menu" ref={invite.ref}>
              <Button variant="secondary" size="sm" aria-haspopup="menu" aria-expanded={invite.open} onClick={() => invite.setOpen((v) => !v)}>
                {t('tg.inviteToTrip')}
              </Button>
              {invite.open && (
                <span className="tg-menu-list" role="menu">
                  {invitable.map((p) => (
                    <Button key={p.id} variant="quiet" size="sm" role="menuitem" className="tg-menu-item" onClick={() => inviteTo(p.id)}>
                      {p.label || (p.cities || []).join(', ')}
                    </Button>
                  ))}
                </span>
              )}
            </span>
          )}
          <span className="tg-menu" ref={more.ref}>
            <IconButton label={t('tg.more')} aria-haspopup="menu" aria-expanded={more.open} onClick={() => more.setOpen((v) => !v)}>
              <MoreIcon size={20} />
            </IconButton>
            {more.open && (
              <span className="tg-menu-list" role="menu">
                <Button variant="quiet" size="sm" role="menuitem" className="tg-menu-item" onClick={() => drop(togetherActions.remove)}>
                  {t('friends.remove')}
                </Button>
                <Button variant="quiet" size="sm" role="menuitem" className="tg-menu-item is-danger" onClick={() => drop(togetherActions.block)}>
                  {t('tg.block')}
                </Button>
              </span>
            )}
          </span>
        </span>
      </div>
      {error && <div className="auth-error" role="alert">{error}</div>}
      {notice && <div className="auth-notice auth-notice-inline" role="status">{notice}</div>}

      <div className="tg-grid">
        <div className="tg-col">
          {(you.size > 0 || them.size > 0) && (
            <Block id="tg-duo-h" title={t('tg.youAnd', { who })} className="tg-o-meet">
              <DuoMap you={you} them={them} name={who} t={t} />
            </Block>
          )}
        </div>
        <div className="tg-col">
          {inCountry && (
            <Block id="tg-in-h" title={t('tg.whoIn', { who, country: regionName(inCountry.iso, lang) })} className="tg-o-groups">
              <div className="tg-tip">
                <ToneFace id={link.userId} name={name} emoji={link.avatarEmoji} size="sm" />
                <span>
                  {inCountry.cost != null && <b>{t('tg.aDay', { price: formatMoney(inCountry.cost, { precision: 'whole' }) })}</b>}
                  {inCountry.tip && <q>{inCountry.tip}</q>}
                </span>
              </div>
            </Block>
          )}
          {bothSaved.length > 0 && (
            <Block id="tg-both-h" title={t('tg.bothSaved')} className="tg-o-plans">
              <div className="tg-list">
                {bothSaved.map((d) => (
                  <div className="tg-bi" key={d.id}>
                    <HeroImage url={d.image?.url || null} city={d.city} iso2={d.iso2} className="tg-bi-img" maxWidth={160} sizes="56px" ratio={[1, 1]} />
                    <span className="tg-bi-tx">
                      <b>{d.city}</b>
                      {Number.isFinite(dayOf(d)) && <span>{t('tg.aDay', { price: formatMoney(dayOf(d), { precision: 'whole' }) })}</span>}
                    </span>
                    {onPlanPlace && <Button variant="secondary" size="sm" onClick={() => onPlanPlace(d.id)}>{t('tg.planTogether')}</Button>}
                  </div>
                ))}
              </div>
            </Block>
          )}
          {next && (
            <Block id="tg-next-h" title={t('tg.next')} className="tg-o-people">
              <div className="tg-bi">
                <HeroImage url={destOf(next)?.image?.url || null} city={destOf(next)?.city || (next.cities || [])[0]} iso2={destOf(next)?.iso2}
                  className="tg-bi-img" maxWidth={160} sizes="56px" ratio={[1, 1]} />
                <span className="tg-bi-tx">
                  <b>{next.label || (next.cities || []).join(', ')}</b>
                  <span>{fmtShort(next.startDate, next.endDate, lang, t('friends.dateJoin'))}</span>
                </span>
              </div>
            </Block>
          )}
        </div>
      </div>
    </div>
  );
}
