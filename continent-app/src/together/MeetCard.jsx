import React from 'react';
import { useI18n } from '../i18n/index.jsx';
import { Button } from '../components/ui/index.js';
import { laneGeometry } from './overlaps.js';
import { ToneFace, ToneFaces, fmtShort, firstName } from './parts.jsx';

/**
 * Plans that meet (T929), the signature card: you and a friend in the same
 * city on the same days, drawn as two date lanes on one scale with the
 * shared days outlined. "Plan a day together" opens the day planner in that
 * city on the first shared day; "Hide" puts the card away on this device.
 */
export function MeetCard({ o, me, meName = '', onPlanDay, onHide }) {
  const { t, lang } = useI18n();
  const g = laneGeometry(o);
  const who = firstName(o.friendName);
  const dates = fmtShort(o.start, o.end, lang, t('friends.dateJoin'));
  const cols = `repeat(${g.days.length}, minmax(0, 1fr))`;
  const pos = (sp) => ({ left: `${sp.left}%`, width: `${sp.width}%` });
  return (
    <section className="tg-meet" aria-label={t('tg.meetTitle', { who, city: o.city, dates })}>
      <ToneFaces me={me} size="md" people={[{ id: me, name: meName || t('tg.you') }, { id: o.friendId, name: o.friendName, emoji: o.emoji }]} />
      <h3>{t('tg.meetTitle', { who, city: o.city, dates })}</h3>
      <div className="tg-lanes" aria-hidden="true">
        <div className="tg-scale" style={{ gridTemplateColumns: cols }}>
          {g.days.map((d) => <span key={d}>{Number(d.slice(8))}</span>)}
        </div>
        <div className="tg-lane">
          <ToneFace id={me} me={me} name={meName || t('tg.you')} size="sm" />
          <span className="tg-track"><span className="tg-bar is-you" style={pos(g.you)}>{o.mine.label || o.city}</span></span>
        </div>
        <div className="tg-lane">
          <ToneFace id={o.friendId} me={me} name={o.friendName} emoji={o.emoji} size="sm" />
          <span className="tg-track"><span className="tg-bar is-them" style={pos(g.them)}>{o.theirs.label || o.city}</span></span>
        </div>
        <span className="tg-over" style={{ left: `calc(var(--space-3) + 34px + (100% - 2 * var(--space-3) - 34px) * ${g.over.left / 100})`, width: `calc((100% - 2 * var(--space-3) - 34px) * ${g.over.width / 100})` }} />
      </div>
      <div className="tg-meet-acts">
        {o.destId && (
          <Button className="tg-on-dark" onClick={() => onPlanDay?.(o.destId, o.start)}>{t('tg.planDayTogether')}</Button>
        )}
        <Button className="tg-on-dark-quiet" onClick={() => onHide?.(o.key)}>{t('tg.hide')}</Button>
      </div>
    </section>
  );
}
