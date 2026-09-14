import React, { useEffect, useRef, useState } from 'react';
import {
  MedalIcon, PlusIcon, CompassIcon, LinkIcon, SparkIcon, FriendsIcon,
} from '../components/Icons.jsx';
import { useI18n } from '../i18n/index.jsx';
import { BADGES, fetchAchievements } from './achievements.js';

/**
 * FriendBadges, the milestone row at the foot of the friends spoke.
 *
 * Five medallions, one per milestone the database awards (migration 013).
 * An earned one takes the ochre seal treatment; a locked one sits as a muted
 * outline whose only job is to say, on a tap, exactly what would earn it. The
 * one counted badge wears a thin progress ring fed by the friend list the
 * spoke has already fetched, so drawing progress costs no query.
 *
 * A badge that arrives DURING this visit pops once. One that was already
 * earned when the page opened is furniture, not an event, so it never
 * animates: the pop is a confirmation of something you just did, and it only
 * means that if it cannot fire twice.
 *
 * When the ledger cannot be read at all (signed out, or a project without
 * migration 013) the whole section is absent rather than all-locked, because
 * "we cannot know" rendered as "you have earned nothing" reads as losing
 * your badges.
 */

const ICONS = {
  icebreaker: PlusIcon,
  well_connected: FriendsIcon,
  copilot: CompassIcon,
  local_guide: LinkIcon,
  catalyst: SparkIcon,
};

// The ring is drawn in a 48-unit box around a 46px medal; the -4px inset in
// CSS scales it so the arc clears the medal's edge by about a pixel.
const RING_R = 21.5;
const RING_C = 2 * Math.PI * RING_R;

function ProgressRing({ n, target }) {
  const frac = Math.max(0, Math.min(1, n / target));
  return (
    <svg className="fbadge-ring" viewBox="0 0 48 48" aria-hidden="true">
      <circle className="fbadge-ring-track" cx="24" cy="24" r={RING_R} />
      <circle
        className="fbadge-ring-fill"
        cx="24"
        cy="24"
        r={RING_R}
        strokeDasharray={RING_C}
        strokeDashoffset={RING_C * (1 - frac)}
      />
    </svg>
  );
}

export function FriendBadges({ userId, friendCount, refreshKey }) {
  const { t } = useI18n();
  const [earned, setEarned] = useState(null);
  const [open, setOpen] = useState('');
  const [fresh, setFresh] = useState(() => new Set());
  const seen = useRef(null);

  useEffect(() => {
    let live = true;
    fetchAchievements(userId).then((map) => {
      if (!live) return;
      if (map && seen.current) {
        const arrived = [...map.keys()].filter((id) => !seen.current.has(id));
        if (arrived.length) setFresh((prev) => new Set([...prev, ...arrived]));
      }
      if (map) seen.current = new Set(map.keys());
      setEarned(map);
    });
    return () => { live = false; };
  }, [userId, refreshKey]);

  if (!earned) return null;

  const fmtDate = (iso) => {
    try {
      return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
        .format(new Date(iso));
    } catch {
      return '';
    }
  };

  const picked = BADGES.find((b) => b.id === open);
  const pickedAt = picked ? earned.get(picked.id) : null;

  return (
    <div className="panel-section">
      <div className="section-title section-title-iconed">
        <MedalIcon size={12} /> {t('friends.badgesTitle')}
      </div>
      <div className="fbadge-row">
        {BADGES.map((b) => {
          const Icon = ICONS[b.id];
          const at = earned.get(b.id);
          const n = b.target ? Math.min(friendCount, b.target) : 0;
          return (
            <button
              key={b.id}
              type="button"
              className={[
                'fbadge',
                at ? 'fbadge-earned' : '',
                fresh.has(b.id) ? 'fbadge-fresh' : '',
                open === b.id ? 'on' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => setOpen(open === b.id ? '' : b.id)}
              aria-expanded={open === b.id}
              title={at ? `${t('friends.badgeEarned')} ${fmtDate(at)}` : t(b.howKey)}
            >
              <span className="fbadge-medal">
                {b.target && !at ? <ProgressRing n={n} target={b.target} /> : null}
                <Icon size={19} />
              </span>
              <span className="fbadge-name">{t(b.nameKey)}</span>
              {b.target && !at && (
                <span className="fbadge-count">{n}/{b.target}</span>
              )}
            </button>
          );
        })}
      </div>
      {picked && (
        <div className="fbadge-about">
          <b>{t(picked.nameKey)}</b>
          {pickedAt ? (
            <span>
              {t('friends.badgeEarned')} <span className="fbadge-date">{fmtDate(pickedAt)}</span>
            </span>
          ) : (
            <span>{t(picked.howKey)}</span>
          )}
        </div>
      )}
    </div>
  );
}
