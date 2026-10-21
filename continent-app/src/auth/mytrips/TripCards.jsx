import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button, Card, Chip } from '../../components/ui/index.js';
import { HeroImage } from '../../components/HeroImage.jsx';
import { CountryFlagStack } from '../../components/CountryFlag.jsx';
import {
  SunIcon, PartSunIcon, CloudIcon, FogIcon, RainIcon, DrizzleIcon, SnowIcon, StormIcon,
  ListDayIcon, PersonIcon, ChevronRightIcon,
} from '../../components/Icons.jsx';
import { useForecast } from '../../lib/weather.js';
import { daysUntil } from '../../lib/myTrips.js';
import { CardMenu, TripPrice, Faces, whenText } from './parts.jsx';

const SKY = {
  sun: SunIcon, partsun: PartSunIcon, cloud: CloudIcon, fog: FogIcon,
  rain: RainIcon, drizzle: DrizzleIcon, snow: SnowIcon, storm: StormIcon,
};

/**
 * What the weather does on the first day. Within a week of leaving it is the
 * live forecast for that day (MET Norway, the same source as the destination
 * panel); further out it is the month's usual daytime high from the climate
 * normals on the wire. Nothing when neither is known.
 */
function useTripWeather(dest, start, todayIso) {
  const n = start ? daysUntil(start, todayIso) : null;
  const soon = n != null && n >= 0 && n <= 6;
  const lat = dest?.city_lat ?? dest?.lat;
  const lon = dest?.city_lon ?? dest?.lon;
  const rows = useForecast(lat, lon, soon);
  if (soon && Array.isArray(rows)) {
    const r = rows.find((x) => x.date === start) || rows[0];
    if (r?.hi != null) return { kind: 'forecast', hi: Math.round(r.hi), sky: r.kind };
  }
  const m = start ? Number(start.slice(5, 7)) : null;
  const row = m ? dest?.climate?.m?.[m - 1] : null;
  if (row && row[0] != null) return { kind: 'usual', hi: Math.round(row[0]) };
  return null;
}

/** One fact as a label over its value, the house's quiet fact row. */
function Fact({ label, children, wide = false }) {
  return (
    <div className={`mt-fact${wide ? ' is-wide' : ''}`}>
      <dt className="mt-fact-label">{label}</dt>
      <dd className="mt-fact-value">{children}</dd>
    </div>
  );
}

/**
 * The next trip, the page's focal object (carta-design "Focal card": one size
 * larger than the rows that follow). Photo, countdown, the route and the
 * dates, then four facts a returning traveller checks first: what the trip
 * costs the party now, the weather to expect, how many days are planned and
 * who is going. One primary, "Open trip"; plan days and invite beside it.
 */
export function TripHeroCard({
  title, sub, img, iso2, countries = [], when, dates, nights, figure, dest, start, todayIso,
  planned, days, people = [], party = null, id = '', onOpen, onPlanDays, onInvite, inviteOpen = false, inviteLabel,
  coplanBy = '', menuActions = [], onRemove, removeLabel,
}) {
  const { t } = useI18n();
  const weather = useTripWeather(dest, start, todayIso);
  const Sky = weather?.kind === 'forecast' ? (SKY[weather.sky] || CloudIcon) : SunIcon;
  const share = days > 0 ? Math.min(1, planned / days) : 0;
  return (
    <article className="mt-hero" aria-label={title}>
      {/* The photo opens the trip for a pointer; the keyboard has "Open trip". */}
      <div className="mt-hero-media" onClick={onOpen} aria-hidden="true">
        <HeroImage url={img} city={title} iso2={iso2} className="mt-hero-img" maxWidth={960} ratio={[3, 2]}
          sizes="(min-width: 1024px) 440px, 100vw" eager />
      </div>
      <div className="mt-hero-body">
        <div className="mt-hero-top">
          {when && <Chip kind="status" tone="neutral">{whenText(t, when)}</Chip>}
          {countries.length > 0 && <CountryFlagStack countries={countries} size={16} />}
          <span className="mt-spacer" />
          <CardMenu actions={menuActions} onRemove={onRemove} removeLabel={removeLabel} />
        </div>
        <h3 className="mt-hero-title">{title}</h3>
        {sub && <p className="mt-hero-sub">{sub}</p>}
        {(dates || nights > 0) && (
          <p className="mt-hero-dates">
            {[dates, nights > 0 ? t(nights === 1 ? 'saved.nights1' : 'saved.nightsN', { n: nights }) : '']
              .filter(Boolean).join(', ')}
          </p>
        )}
        {coplanBy && (
          <p className="mt-hero-coplan"><PersonIcon size={14} /> {t('coplan.ownedBy', { who: coplanBy })}</p>
        )}
        <dl className="mt-facts">
          <Fact label={t('saved.factCost')}>
            {figure ? <TripPrice figure={figure} /> : <span className="mt-muted">{t('saved.factNoPrice')}</span>}
          </Fact>
          {weather && (
            <Fact label={t('saved.factWeather')}>
              <span className="mt-weather">
                {weather.kind === 'forecast' && <Sky size={16} />}
                {t(weather.kind === 'forecast' ? 'saved.weatherForecast' : 'saved.weatherUsual', { t: weather.hi })}
              </span>
            </Fact>
          )}
          {days > 0 && (
            <Fact label={t('saved.factDays')}>
              <span className="mt-progress">
                <span>{t('saved.daysOf', { n: planned, of: days })}</span>
                <span className="mt-bar" aria-hidden="true"><span style={{ transform: `scaleX(${share})` }} /></span>
              </span>
            </Fact>
          )}
          {/* Who is going, from the same party the price is for, so the card
              never says "for 2" beside "Only you". Named people show as faces. */}
          <Fact label={t('saved.factGoing')}>
            {(party || people.length + 1) > 1
              ? <span className="mt-going"><Faces people={people} /><span className="mt-going-n">{t('saved.goingN', { n: Math.max(party || 0, people.length + 1) })}</span></span>
              : <span className="mt-muted">{t('saved.goingYou')}</span>}
          </Fact>
        </dl>
        <div className="mt-hero-actions">
          <Button variant="primary" onClick={onOpen}>{t('saved.openTrip')}</Button>
          {onPlanDays && (
            <Button iconStart={<ListDayIcon size={18} />} onClick={onPlanDays}>
              {planned > 0 ? t('saved.keepPlanning') : t('saved.planDays')}
            </Button>
          )}
          {onInvite && (
            <Button iconStart={<PersonIcon size={18} />} onClick={onInvite} aria-expanded={inviteOpen} aria-controls={id ? `tshare-${id}` : undefined}>
              {inviteLabel || t('saved.invite')}
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

/**
 * A later trip, a draft or a day plan: the kit's compact row (72 px photo,
 * name, when, price), the whole row one button, its menu beside it.
 */
export function TripRow({
  title, img, iso2, meta, figure = null, onOpen, menuActions = [], onRemove, removeLabel, children,
}) {
  return (
    <div className="mt-row-wrap">
      <Card
        layout="row"
        as="div"
        className="mt-row"
        media={<HeroImage url={img} city={title} iso2={iso2} className="mt-row-img" maxWidth={330} ratio={[1, 1]} sizes="72px" />}
        title={title}
        onOpen={onOpen}
        meta={meta}
        price={figure}
        actions={(menuActions.length || onRemove)
          ? <CardMenu actions={menuActions} onRemove={onRemove} removeLabel={removeLabel} />
          : <ChevronRightIcon size={18} className="mt-row-go" aria-hidden="true" />}
      />
      {children}
    </div>
  );
}
