import React from 'react';
import { m, useInView } from 'motion/react';
import { useI18n } from '../../i18n/index.jsx';
import { formatMoney } from '../../lib/money.js';
import { STORY_PLACE, placeDay, weekSum } from '../../lib/homeDemo.js';
import { MaskedText, Reveal, SPRING, Settle } from './motionKit.jsx';
import { Bed, CoffeeBean, ICON } from './homeIcons.jsx';

export const STORY_NIGHTS = 7;

/** The story's week, a person: the place's own day price (bed, food and
 *  drink) at the traveller's Lifestyle and the sweep's return flight from
 *  their home airport, or null when the place has no price. */
export function useStoryWeek(rows, flightFor) {
  return React.useMemo(() => {
    const cost = placeDay(rows, STORY_PLACE);
    const flight = flightFor ? flightFor(STORY_PLACE) : null;
    const sum = weekSum(cost, STORY_NIGHTS, flight);
    return sum ? { ...sum, cost, flightInfo: flight } : null;
  }, [rows, flightFor]);
}

/** Fill a translated sentence around one accented value: the accent travels
 *  as a placeholder so each language keeps its own word order. */
export function accented(t, key, vars, accentKey, accent) {
  const MARK = '\u0001';
  const [a, b = ''] = t(key, { ...vars, [accentKey]: MARK }).split(MARK);
  return [a, { em: accent }, b].filter((p) => (typeof p === 'string' ? p.trim() : true));
}

/**
 * The real cost (T950, owner 2026-10-31). An umber panel rises over the
 * film's bottom edge and says what the flight leaves out: the bed and the
 * days at the story place, each chapter led by its amount, a receipt beside
 * them that takes a line as each chapter reaches the middle of the view
 * (on a phone, a running total held to the panel's bottom edge). Real
 * figures only: the place's own day price, the sweep's flight or no flight
 * line at all.
 */
export function HomeCost({ week, place, from }) {
  const { t, lang } = useI18n();
  const money = (v) => formatMoney(v, { precision: 'whole', locale: lang });
  const [active, setActive] = React.useState(-1);
  const seen = React.useCallback((i, on) => setActive((a) => (on ? Math.max(a, i) : (a === i ? i - 1 : a))), []);
  if (!week || !place) return null;
  const n = STORY_NIGHTS;
  const fly = week.flight;
  const title = fly
    ? accented(t, 'home.costTitle', { place }, 'price', money(fly))
    : [t('home.costTitleNoFlight', { place })];
  const chapters = [
    { k: 'bed', Icon: Bed, label: t('home.costBed'), amt: week.bed, per: t('home.forNights', { n }),
      line: t('home.costBedLine', { place }), facts: [t('home.nightPrice', { price: money(week.cost.stayEur) }), t('home.nNights', { n })] },
    { k: 'food', Icon: CoffeeBean, label: t('home.costDays'), amt: week.food, per: t('home.forDays', { n }),
      line: t('home.costDaysLine'), facts: [t('home.dayPrice', { price: money(week.cost.foodEur) }), t('home.nDays', { n })] },
  ];
  const lines = [
    fly ? { k: 'fly', label: t('home.rcptFlight'), sub: from && week.flightInfo?.to ? t('home.rcptRoute', { from, to: week.flightInfo.to }) : null, v: fly, on: true } : null,
    { k: 'bed', label: t('home.costBed'), sub: t('home.rcptAt', { n, price: money(week.cost.stayEur) }), v: week.bed, on: active >= 0 },
    { k: 'food', label: t('home.rcptFood'), sub: t('home.rcptAt', { n, price: money(week.cost.foodEur) }), v: week.food, on: active >= 1 },
  ].filter(Boolean);
  const total = lines.filter((l) => l.on).reduce((s, l) => s + l.v, 0);
  const last = [...lines].reverse().find((l) => l.on);

  return (
    <section className="hm-cost" aria-labelledby="hm-cost-title">
      <div className="hm-in">
        <div className="hm-cost-head">
          <MaskedText as="p" className="hm-kick" parts={[t('home.costKick')]} />
          <MaskedText id="hm-cost-title" className="hm-big" parts={title} />
        </div>
        <div className="hm-cost-grid">
          <div>
            {chapters.map((c, i) => <CostChapter key={c.k} i={i} c={c} money={money} onSeen={seen} />)}
          </div>
          <div className="hm-stage">
            <div className="hm-rcpt" aria-live="polite">
              <div className="hm-rcpt-head"><b>{t('home.rcptTitle', { place, n })}</b><span>{t('home.aPerson')}</span></div>
              {lines.map((l) => (l.on ? (
                <m.div key={l.k} className="hm-rcpt-line" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={SPRING.surface}>
                  <span>{l.label}{l.sub && <small>{l.sub}</small>}</span><b>{money(l.v)}</b>
                </m.div>
              ) : null))}
              <div className="hm-rcpt-total"><span>{t('home.soFar')}</span><Settle className="hm-rcpt-sum" value={money(total)} /></div>
            </div>
          </div>
        </div>
        <div className="hm-runbar" aria-hidden="true">
          <span className="hm-runbar-last">{last ? `${last.label} ${money(last.v)}` : ''}</span>
          <span className="hm-runbar-tot"><small>{t('home.soFar')}</small><Settle value={money(total)} /></span>
        </div>
      </div>
    </section>
  );
}

function CostChapter({ i, c, money, onSeen }) {
  const ref = React.useRef(null);
  const mid = useInView(ref, { margin: '-40% 0px -45% 0px' });
  React.useEffect(() => { onSeen(i, mid); }, [i, mid, onSeen]);
  const { Icon } = c;
  return (
    <Reveal as="article" className={`hm-chapter${mid ? ' is-on' : ''}`} ref={ref}>
      <span className="hm-chapter-label"><Icon {...ICON} />{c.label}</span>
      <span className="hm-amount">{money(c.amt)}<small>{c.per}</small></span>
      <p className="hm-chapter-line">{c.line}</p>
      <div className="hm-facts">{c.facts.map((f) => <span key={f}>{f}</span>)}</div>
    </Reveal>
  );
}

