import React from 'react';
import { useInView } from 'motion/react';
import { useI18n } from '../../i18n/index.jsx';
import { formatMoney } from '../../lib/money.js';
import { STORY_PLACE, placeDay, weekSum } from '../../lib/homeDemo.js';
import { MaskedText, Reveal } from './motionKit.jsx';
import { HouseIcon } from '../../components/HouseIcons.jsx';
import { CostRow, Figure, Formation, Plate } from '../../components/ui/index.js';

export const STORY_NIGHTS = 7;

/** The story's week, a person: the place's own day price (bed, food and
 *  drink) at the traveller's Lifestyle and the sweep's return flight from
 *  their home airport, or null when the place has no price. */
// eslint-disable-next-line react-refresh/only-export-components -- T1163 baseline: a non-component export kept here
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
// eslint-disable-next-line react-refresh/only-export-components -- T1163 baseline: a non-component export kept here
export function accented(t, key, vars, accentKey, accent) {
  const MARK = '\u0001';
  const [a, b = ''] = t(key, { ...vars, [accentKey]: MARK }).split(MARK);
  return [a, { em: accent }, b].filter((p) => (typeof p === 'string' ? p.trim() : true));
}

/**
 * The real cost (T950, owner 2026-10-31; house style 2026-11, home lane).
 * The page's one umber band says what the flight leaves out: the bed and
 * the days at the story place, each led by its amount, and beside them the
 * week as the house's paper cost post (the trip and place pages' object):
 * the place's day as a formation, the week's lines, a Rounding line only
 * when the printed lines do not add up, and the one ink total plate with
 * the week's own figure. Every line is there from the first paint; the
 * first time the post comes into view its wagons couple in and the plate
 * settles, once. Real figures only: the place's own day price, the sweep's
 * flight or no flight line at all.
 */
export function HomeCost({ week, place, from }) {
  const { t, lang } = useI18n();
  const money = (v) => formatMoney(v, { precision: 'whole', locale: lang });
  const ref = React.useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.35 });
  if (!week || !place) return null;
  const n = STORY_NIGHTS;
  const fly = week.flight;
  const title = fly
    ? accented(t, 'home.costTitle', { place }, 'price', money(fly))
    : [t('home.costTitleNoFlight', { place })];
  const chapters = [
    { k: 'bed', Icon: HouseIcon.bed, label: t('home.costBed'), amt: week.bed, per: t('home.forNights', { n }), line: t('home.costBedLine', { place }) },
    { k: 'food', Icon: HouseIcon.food, label: t('home.costDays'), amt: week.food, per: t('home.forDays', { n }), line: t('home.costDaysLine') },
  ];
  const lines = [
    fly ? { k: 'flight', label: t('home.rcptFlight'), sub: from && week.flightInfo?.to ? t('home.rcptRoute', { from, to: week.flightInfo.to }) : null, v: fly } : null,
    { k: 'bed', label: t('home.costBed'), sub: t('home.rcptAt', { n, price: money(week.cost.stayEur) }), v: week.bed },
    { k: 'food', label: t('home.rcptFood'), sub: t('home.rcptAt', { n, price: money(week.cost.foodEur) }), v: week.food },
  ].filter(Boolean);
  // The total is the week's own figure; when the printed whole-euro lines
  // do not add up to it, a Rounding line says by how much (decision 0012).
  const whole = (v) => Math.round(v);
  const rounding = whole(week.total) - lines.reduce((sum, l) => sum + whole(l.v), 0);

  return (
    <section className="hm-cost" aria-labelledby="hm-cost-title">
      <div className="hm-in">
        <MaskedText id="hm-cost-title" className="hm-big hm-cost-title" parts={title} />
        <div className="hm-cost-grid">
          <div className="hm-chapters">
            {chapters.map((c, i) => (
              <Reveal as="article" key={c.k} className="hm-chapter" delay={i * 0.08}>
                <span className="hm-chapter-label"><c.Icon size={18} />{c.label}</span>
                <span className="hm-amount">{money(c.amt)}<small>{c.per}</small></span>
                <p className="hm-chapter-line">{c.line}</p>
              </Reveal>
            ))}
          </div>
          <aside className={`hm-post${inView ? ' is-in' : ''}`} ref={ref} aria-labelledby="hm-post-title">
            <div className="hm-post-head">
              <h3 id="hm-post-title">{t('home.rcptTitle', { place, n })}</h3>
              <span>{t('home.aPerson')}</span>
            </div>
            <div className="hm-post-day">
              <Formation size="lg" weighted go={fly ? { mode: 'flight', amount: fly } : undefined}
                bed={week.cost.stayEur} food={week.cost.foodEur} day={week.cost.dayEur} dayLabel={t('home.tryPerDay')} />
              <span className="hm-post-unit">{t('home.tryPerDay')}</span>
            </div>
            <dl className="costrows hm-post-lines">
              {lines.map((l) => (
                <CostRow key={l.k} kind={l.k} label={l.label} sub={l.sub} value={money(l.v)} />
              ))}
              {rounding !== 0 && <CostRow label={t('place.rounding')} value={money(rounding)} />}
            </dl>
            <Plate variant="total" className="hm-post-total" settle={inView} name={t('home.weekTotal')}
              fig={<Figure value={week.total} still />} />
          </aside>
        </div>
      </div>
    </section>
  );
}
