import React, { useEffect, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { PlusIcon, LinkIcon, BoltIcon } from '../components/Icons.jsx';
import { HouseIcon } from '../components/HouseIcons.jsx';
import { BADGES, fetchAchievements } from '../auth/achievements.js';
import { SectHead } from '../auth/mytrips/atlas/Ink.jsx';
import { useTogether } from './useTogether.js';
import { FriendsSee, PayLink } from './Privacy.jsx';
import { ToneFace, nameOf } from './parts.jsx';

/**
 * Jij (G16, decision 0017): you as friends see you. It replaces the privacy
 * view and the lock button: your face, name and handle; what friends see
 * (the existing switches); your payment link; and the five milestones as
 * rings that fill to their progress (owner 2026-11-23: milestones on Jij).
 * An earned ring is a solid umber disc with a paper icon, a locked one a
 * hairline ring. Tapping one says how it is earned, or when it was.
 */
const ICONS = {
  icebreaker: PlusIcon,
  well_connected: HouseIcon.people,
  copilot: HouseIcon.route,
  local_guide: LinkIcon,
  catalyst: BoltIcon,
};
const R = 26;
const C = 2 * Math.PI * R;

function Milestones({ userId, friendCount }) {
  const { t, lang } = useI18n();
  const [earned, setEarned] = useState(null);
  const [open, setOpen] = useState('');
  useEffect(() => {
    let live = true;
    fetchAchievements(userId).then((m) => { if (live) setEarned(m); });
    return () => { live = false; };
  }, [userId, friendCount]);
  // An unreadable ledger hides the section: "nothing earned" would be a lie.
  if (!earned) return null;
  const got = BADGES.filter((b) => earned.has(b.id)).length;
  const picked = BADGES.find((b) => b.id === open);
  const when = (iso) => {
    try { return new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso)); } catch { return ''; }
  };
  return (
    <section className="vr-sect" aria-labelledby="vr-ms-h">
      <SectHead id="vr-ms-h" as="h2" title={t('friends.badgesTitle')} count={t('vr.ofN', { i: got, n: BADGES.length })} />
      <div className="vr-stamps">
        {BADGES.map((b) => {
          const Icon = ICONS[b.id];
          const at = earned.get(b.id);
          const frac = at ? 1 : b.target ? Math.min(friendCount, b.target) / b.target : 0;
          const name = t(b.nameKey);
          const state = at ? t('vr.earned') : b.target ? t('vr.ofN', { i: Math.min(friendCount, b.target), n: b.target }) : t('vr.locked');
          return (
            <button key={b.id} type="button" className={`vr-stamp${at ? ' is-got' : ''}`} aria-expanded={open === b.id}
              aria-label={`${name}, ${state}`} onClick={() => setOpen(open === b.id ? '' : b.id)}>
              <svg viewBox="0 0 60 60" aria-hidden="true">
                <circle className="vr-stamp-track" cx="30" cy="30" r={R} />
                {!at && frac > 0 && (
                  <circle className="vr-stamp-fill" cx="30" cy="30" r={R} strokeDasharray={`${C * frac} ${C}`} transform="rotate(-90 30 30)" />
                )}
              </svg>
              <span className="vr-stamp-ic" aria-hidden="true"><Icon size={22} /></span>
              <span className="vr-stamp-n" aria-hidden="true">{name}</span>
              {!at && b.target && <span className="vr-stamp-p num" aria-hidden="true">{state}</span>}
            </button>
          );
        })}
      </div>
      {picked && (
        <p className="vr-stamp-how" role="status">
          {earned.get(picked.id) ? `${t('friends.badgeEarned')} ${when(earned.get(picked.id))}` : t(picked.howKey)}
        </p>
      )}
    </section>
  );
}

export function MeView({ back, headRef, onOpenSaved }) {
  const { t } = useI18n();
  const s = useTogether();
  const name = nameOf(s.me) || t('vr.you');
  const friends = s.links.filter((l) => l.kind === 'friend').length;
  return (
    <div className="tg-page vr-page vr-me">
      <div className="vr-head is-sub">
        {back}
        <h1 className="vr-h1" ref={headRef} tabIndex={-1} data-focus-quiet="">{t('vr.you')}</h1>
      </div>
      <div className="vr-mecard">
        <ToneFace id={s.userId} me={s.userId} name={name} emoji={s.me?.avatarEmoji} size="lg" />
        <span className="vr-mecard-tx">
          <b>{name}</b>
          {s.me?.handle && <span>@{s.me.handle}</span>}
        </span>
      </div>
      <div className="vr-me-grid">
        <div className="vr-col">
          <FriendsSee onOpenSaved={onOpenSaved} title={t('vr.whatFriendsSee')} />
          <PayLink />
        </div>
        <div className="vr-col">
          <Milestones userId={s.userId} friendCount={friends} />
        </div>
      </div>
    </div>
  );
}
