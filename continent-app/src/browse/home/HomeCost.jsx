import React from 'react';
import { useInView, useReducedMotion } from 'motion/react';
import { useI18n } from '../../i18n/index.jsx';
import { formatMoney } from '../../lib/money.js';
import { STORY_PLACE, placeDay, weekSum } from '../../lib/homeDemo.js';
import { MaskedText, Reveal } from './motionKit.jsx';
import { CostRow, Figure, Formation, Plate, ReliefBand } from '../../components/ui/index.js';
import { COST_ICON } from '../../components/ui/CostRow.jsx';
import { useDossier } from '../../lib/dossier.js';
import { useMedia } from './useHome.js';

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
 * The real cost (T950, owner 2026-10-31; house style 2026-11, home lane,
 * fix round 1). The page's one umber band says what the flight leaves out.
 * Its head carries the relief of the story place's own peaks with their
 * real heights (DESIGN.md "Signature graphics"; none drawn when the place
 * has no measured peak). Under it the bed and the days are the story, in
 * words, and the house's paper cost post carries the money, each figure
 * once: the place's day as a formation, the week's lines, a Rounding line
 * only when the printed lines do not add up, and the one ink total plate
 * with the week's own figure. Every figure is printed from the first paint.
 * The band builds in order: on a wide screen each chapter paints its line
 * in the post as it reaches the middle of the view (the base's old rule, a
 * paint stroke only, no figure moves); on a phone the lines paint one after
 * the other when the post comes into view. When both are painted the plate
 * settles once. Real figures only.
 */
export function HomeCost({ week, place, from }) {
  const { t, lang } = useI18n();
  const money = (v) => formatMoney(v, { precision: 'whole', locale: lang });
  const ref = React.useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.35 });
  const wide = useMedia('(min-width: 768px)');
  const reduce = useReducedMotion();
  const dossier = useDossier(STORY_PLACE);
  const heights = React.useMemo(() => { const f = new Intl.NumberFormat(lang); return (v) => f.format(v); }, [lang]);
  const [seen, setSeen] = React.useState(() => new Set());
  const onSeen = React.useCallback((k) => setSeen((s) => (s.has(k) ? s : new Set([...s, k]))), []);
  if (!week || !place) return null;
  const n = STORY_NIGHTS;
  const fly = week.flight;
  const title = fly
    ? accented(t, 'home.costTitle', { place }, 'price', money(fly))
    : [t('home.costTitleNoFlight', { place })];
  const chapters = [
    { k: 'bed', Icon: COST_ICON.bed, label: t('home.costBed'), line: t('home.costBedLine', { place }) },
    { k: 'food', Icon: COST_ICON.food, label: t('home.costDays'), line: t('home.costDaysLine') },
  ];
  // Phone: the post paints its lines in order once it is in view. Wide: the
  // chapters paint them. Reduced motion: every line painted at once.
  const lit = (k) => reduce || (wide ? seen.has(k) : inView);
  const lines = [
    fly ? { k: 'flight', label: t('home.rcptFlight'), sub: from && week.flightInfo?.to ? t('home.rcptRoute', { from, to: week.flightInfo.to }) : null, v: fly, on: true } : null,
    { k: 'bed', label: t('home.costBed'), v: week.bed, on: lit('bed') },
    { k: 'food', label: t('home.rcptFood'), v: week.food, on: lit('food') },
  ].filter(Boolean);
  // The total is the week's own figure; when the printed whole-euro lines
  // do not add up to it, a Rounding line says by how much (decision 0012).
  const whole = (v) => Math.round(v);
  const rounding = whole(week.total) - lines.reduce((sum, l) => sum + whole(l.v), 0);
  const built = lines.every((l) => l.on);

  return (
    <section className="hm-cost" aria-labelledby="hm-cost-title">
      <div className="hm-in">
        <ReliefBand mountains={dossier?.nearby?.mountains} seed={STORY_PLACE} cut="56%" className="hm-cost-head" format={heights}>
          <MaskedText id="hm-cost-title" className="hm-big hm-cost-title" parts={title} />
        </ReliefBand>
        <div className="hm-cost-grid">
          <div className="hm-chapters">
            {chapters.map((c) => <CostChapter key={c.k} c={c} on={lit(c.k)} onSeen={onSeen} />)}
          </div>
          <aside className={`hm-post${inView ? ' is-in' : ''}`} ref={ref} aria-labelledby="hm-post-title">
            <div className="hm-post-head">
              <h3 id="hm-post-title">{t('home.rcptTitle', { place, n })}</h3>
              <span>{t('home.aPerson')}</span>
            </div>
            <div className="hm-post-day">
              <Formation size="lg" weighted bed={week.cost.stayEur} food={week.cost.foodEur} day={week.cost.dayEur} dayLabel={t('home.tryPerDay')} />
              <span className="hm-post-unit">{t('home.tryPerDay')}</span>
            </div>
            <dl className="costrows hm-post-lines">
              {lines.map((l) => (
                <CostRow key={l.k} kind={l.k} label={l.label} sub={l.sub} value={money(l.v)} className={`hm-line${l.on ? ' is-lit' : ''}`} />
              ))}
              {rounding !== 0 && <CostRow label={t('place.rounding')} value={money(rounding)} />}
            </dl>
            <Plate variant="total" className="hm-post-total" settle={built && inView && !reduce} name={t('home.weekTotal')}
              fig={<Figure value={week.total} still />} />
          </aside>
        </div>
      </div>
    </section>
  );
}

/** One chapter of the story: its label and its one line. It lights up and
 *  paints its line in the post when it reaches the middle of the view. */
function CostChapter({ c, on, onSeen }) {
  const ref = React.useRef(null);
  const mid = useInView(ref, { margin: '-40% 0px -45% 0px' });
  React.useEffect(() => { if (mid) onSeen(c.k); }, [mid, c.k, onSeen]);
  return (
    <Reveal as="article" className={`hm-chapter${on ? ' is-on' : ''}`} ref={ref}>
      <span className="hm-chapter-label"><c.Icon size={20} />{c.label}</span>
      <p className="hm-chapter-line">{c.line}</p>
    </Reveal>
  );
}
