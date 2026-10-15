import React, { useId, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { Button } from '../components/ui/index.js';
import { boldSegments, minutesText, stayPriceText } from '../lib/journeys.js';
import { stripDashes } from '../lib/format.js';
import { srcSetFor } from '../lib/heroImage.js';
import {
  BedIcon, BusIcon, CarIcon, ChevronDownIcon, ClockIcon, FerryIcon, MountainIcon, RouteIcon, TrainIcon,
} from '../components/Icons.jsx';

const TRAVEL_ICON = { bus: BusIcon, train: TrainIcon, ferry: FerryIcon, drive: CarIcon };

/**
 * The week, day by day (T431, owner 2026-10-15): a chart of the climb a day
 * and the day cards that swipe under it.
 *
 * The chart is one column a day: the climb as a bar (the distance when the
 * week states no climb), the figure over it, and the day, its distance and
 * its high point under it. A tap on a column brings that day's card into
 * view, and the card in view marks its column, the one selected state
 * (carta-design: the light tint and a brown bar). It is drawn flat: the 3D
 * rule keeps charts flat.
 *
 * A day card is its photograph, "Day 3" and the title, the day's figures as
 * small icon facts, and tonight's bed (the "Where to sleep" section merged
 * into the days): the night's place, the kind of bed and its price. The
 * morning, afternoon and evening, and the bed's booking details, are behind
 * one "More" per card.
 */

const nf = (lang) => (v) => Number(v).toLocaleString(lang, { maximumFractionDigits: 1 });

function Prose({ text, className }) {
  if (!text) return null;
  return (
    <p className={className}>
      {boldSegments(stripDashes(text)).map((seg, i) => (seg.bold ? <b key={i}>{seg.text}</b> : <React.Fragment key={i}>{seg.text}</React.Fragment>))}
    </p>
  );
}

/** The climb chart. `days` from lib/dayStats.js weekStats().days. */
export function WeekClimb({ days, sel = null, onPick }) {
  const { t, lang } = useI18n();
  const fmt = nf(lang);
  const withUp = days.filter((d) => d.up != null);
  const byUp = withUp.length >= Math.ceil(days.length / 2);
  // A bus or ferry day draws no bar on a walking week: its kilometres are
  // travel, said on the day's card.
  const value = (d) => (d.travel && byUp ? null : (byUp ? d.up : d.km));
  const max = Math.max(1, ...days.map((d) => value(d) || 0));
  if (!days.some((d) => value(d) != null && value(d) > 0)) return null;
  return (
    <figure className="wclimb" aria-label={t(byUp ? 'journey.chartClimbAria' : 'journey.chartKmAria')}>
      <div className="wclimb-cols" style={{ '--wclimb-n': days.length }}>
        {days.map((d) => {
          const v = value(d);
          const on = sel === d.day;
          const say = [
            t('journey.dayN', { n: d.day }),
            d.km != null ? `${fmt(d.km)} km` : '',
            d.up != null ? t('journey.chartUp', { m: fmt(d.up) }) : '',
            d.high != null ? t('journey.chartHigh', { m: fmt(d.high) }) : '',
          ].filter(Boolean).join(', ');
          return (
            <Button
              key={d.day}
              variant="quiet"
              className={`wclimb-col${on ? ' is-on' : ''}${d.rest ? ' is-rest' : ''}`}
              aria-pressed={on}
              aria-label={say}
              onClick={() => onPick?.(d.day)}
            >
              <span className="wclimb-fig" aria-hidden="true">
                {v != null && v > 0 ? (byUp ? `+${fmt(v)}` : fmt(v)) : ''}
              </span>
              <span className="wclimb-bar-box" aria-hidden="true">
                <span className="wclimb-bar" style={{ height: `${v ? Math.max(4, (v / max) * 100) : 2}%` }} />
              </span>
              <span className="wclimb-day" aria-hidden="true">{t('journey.dayShort', { n: d.day })}</span>
              <span className="wclimb-sub" aria-hidden="true">{d.km != null && byUp && !d.travel ? `${fmt(d.km)} km` : ''}</span>
              <span className="wclimb-sub is-high" aria-hidden="true">{d.high != null ? `${fmt(d.high)} m` : ''}</span>
            </Button>
          );
        })}
      </div>
      <figcaption className="wclimb-cap">{t(byUp ? 'journey.chartClimbCap' : 'journey.chartKmCap')}</figcaption>
    </figure>
  );
}

/** One day as a card of the day track. */
export function DayCard({ day, stats, stay = null, photo = null }) {
  const { t, lang } = useI18n();
  const [more, setMore] = useState(false);
  const [photoGone, setPhotoGone] = useState(false);
  const panelId = useId();
  const fmt = nf(lang);
  const parts = [['morning', day.morning], ['afternoon', day.afternoon], ['evening', day.evening]]
    .filter(([, text]) => text);
  const facts = [
    stats?.km != null && { key: 'km', icon: TRAVEL_ICON[stats.mode] || RouteIcon, text: `${fmt(stats.km)} km` },
    stats?.up != null && stats.up > 0 && { key: 'up', icon: MountainIcon, text: t('journey.chartUp', { m: fmt(stats.up) }) },
    stats?.down != null && stats.down > 0 && { key: 'down', icon: MountainIcon, text: t('journey.chartDown', { m: fmt(stats.down) }), flip: true },
    stats?.high != null && { key: 'high', icon: MountainIcon, text: t('journey.chartHigh', { m: fmt(stats.high) }) },
    stats?.minutes != null && { key: 'time', icon: ClockIcon, text: minutesText(stats.minutes) },
  ].filter(Boolean);
  const price = stay ? stayPriceText(stay, lang) : '';
  const bedKind = stay ? [stay.style, price].filter(Boolean).join(', ') : '';
  return (
    <article className="tday" id={`jday-${day.day}`}>
      {photo?.url && !photoGone && (
        <div className="tday-media">
          <img
            src={photo.url}
            srcSet={srcSetFor(photo.url, 960)}
            sizes="(max-width: 720px) 86vw, 520px"
            width={photo.w || 3}
            height={photo.h || 2}
            alt={photo.caption || day.title}
            loading="lazy"
            decoding="async"
            onError={() => setPhotoGone(true)}
          />
        </div>
      )}
      <div className="tday-body">
        <p className="tday-n">{t('journey.dayN', { n: day.day })}</p>
        <h3 className="tday-title">{day.title}</h3>
        {facts.length > 0 && (
          <ul className="tday-facts">
            {facts.map((f) => (
              <li key={f.key}>
                <span className={`tday-icon${f.flip ? ' is-flip' : ''}`} aria-hidden="true"><f.icon size={16} /></span>
                <span>{f.text}</span>
              </li>
            ))}
          </ul>
        )}
        {day.sleep && (
          <p className="tday-night">
            <span className="tday-icon" aria-hidden="true"><BedIcon size={16} /></span>
            <span>
              <span className="tday-night-l">{t('journey.tonight')} </span>
              <b>{day.sleep}</b>
              {bedKind && <span className="tday-night-k">{bedKind}</span>}
            </span>
          </p>
        )}
        {(parts.length > 0 || stay?.booking) && (
          <>
            <Button
              variant="quiet"
              size="sm"
              className="tday-more"
              onClick={() => setMore((v) => !v)}
              aria-expanded={more}
              aria-controls={panelId}
              aria-label={t('journey.moreAboutDayN', { n: day.day })}
              iconEnd={<ChevronDownIcon size={16} className={more ? 'tday-chev is-open' : 'tday-chev'} />}
            >
              {more ? t('detail.showLess') : t('item.railMore')}
            </Button>
            <div id={panelId} className="tday-panel" hidden={!more}>
              {more && (
                <div className="tday-prose">
                  {parts.map(([part, text]) => (
                    <div key={part} className="tday-part">
                      <span className="tday-when">{t(`journey.${part}`)}</span>
                      <Prose text={text} className="tday-text" />
                    </div>
                  ))}
                  {stay?.booking && (
                    <div className="tday-part">
                      <span className="tday-when">{t('journey.bookBy')}</span>
                      <Prose text={stay.booking} className="tday-text" />
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </article>
  );
}
