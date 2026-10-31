import React from 'react';
import { animate, m, useInView, useReducedMotion } from 'motion/react';
import { useI18n } from '../../i18n/index.jsx';
import { formatMoney } from '../../lib/money.js';
import { MaskedText, SPRING } from './motionKit.jsx';
import { accented, STORY_NIGHTS } from './HomeCost.jsx';
import { AirplaneTilt, ArrowRight, Bed, CoffeeBean, ICON } from './homeIcons.jsx';

/**
 * The proof (T951; one card since T955, owner 2026-10-31: "enhance this and
 * make it more cleanly blend in"). Two bars on one scale: what a flight site
 * shows (the flight alone, with the rest of the week left as an empty dashed
 * track) and what Carta shows (the flight, the bed and the days). Under them
 * each cost says what moves it, which is the old "dates, people, stay" row
 * said once and tied to the figure it drives; the card's foot holds the note
 * and the one door. The Carta total counts up from the flight, so the week
 * is seen adding up; with no flight in the sweep the section is not shown.
 */
export function HomeProof({ week, place, onPlan, planHref }) {
  const { t, lang } = useI18n();
  const ref = React.useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.45 });
  const money = React.useCallback((v) => formatMoney(v, { precision: 'whole', locale: lang }), [lang]);
  if (!week?.flight) return null;
  const pct = (v) => `${Math.round((v / week.total) * 100)}%`;
  const parts = [
    { k: 'fly', cls: 'is-fly', Icon: AirplaneTilt, label: t('home.rcptFlight'), by: t('home.proofFlyBy'), v: week.flight },
    { k: 'bed', cls: 'is-bed', Icon: Bed, label: t('home.proofBed', { n: STORY_NIGHTS }), by: t('home.proofBedBy'), v: week.bed },
    { k: 'food', cls: 'is-food', Icon: CoffeeBean, label: t('home.proofFood', { n: STORY_NIGHTS }), by: t('home.proofFoodBy'), v: week.food },
  ];
  const go = (e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); onPlan(); };
  // The bars draw first; each cost line arrives as its own segment lands.
  const segAt = (i) => 0.5 + i * 0.14;
  return (
    <section className="hm-proof" aria-labelledby="hm-proof-title">
      <div className="hm-in">
        <MaskedText as="p" className="hm-kick" parts={[t('home.proofKick')]} />
        <MaskedText id="hm-proof-title" className="hm-big hm-proof-title" parts={accented(t, 'home.proofTitle', {}, 'pct', pct(week.flight))} />
        <div className={`hm-compare${inView ? ' is-in' : ''}`} ref={ref}>
          <div className="hm-bars">
            <BarRow label={t('home.proofSites')} parts={[parts[0]]} scale={week.total} on={inView} money={money}
              from={0} to={week.flight} rest />
            <BarRow label={t('home.proofCarta')} parts={parts} scale={week.total} on={inView} money={money}
              from={week.flight} to={week.total} carta delay={0.35} pct={pct} />
          </div>
          <ul className="hm-costs">
            {parts.map((p, i) => (
              <m.li key={p.k} className={`hm-cost-line ${p.cls}`} initial={{ opacity: 0, y: 10 }}
                animate={inView ? { opacity: 1, y: 0 } : undefined} transition={{ ...SPRING.surface, delay: segAt(i) + 0.3 }}>
                <span className="hm-cost-ico" aria-hidden="true"><p.Icon {...ICON} size={20} /></span>
                <span className="hm-cost-name">{p.label}<small>{p.by}</small></span>
                <span className="hm-cost-fig"><b>{money(p.v)}</b><em>{pct(p.v)}</em></span>
              </m.li>
            ))}
          </ul>
          <m.div className="hm-compare-foot" initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : undefined}
            transition={{ ...SPRING.reveal, delay: 1.3 }}>
            <p>
              <b>{t('home.proofFoot')}</b>
              <span>{t('home.proofNote', { place, n: STORY_NIGHTS })}</span>
            </p>
            <a className="btn btn-primary hm-yours-go" href={planHref} onClick={go}>
              <span className="btn-label">{t('home.priceYours')}</span><ArrowRight {...ICON} size={18} weight="bold" aria-hidden="true" />
            </a>
          </m.div>
        </div>
      </div>
    </section>
  );
}

/** One row: a label, its figure counting up to the total, and the bar on the
 *  shared scale. Segments are split by a hairline of the card's white; the
 *  flight site's row shows the rest of the week as an empty dashed track. */
function BarRow({ label, parts, scale, on, money, from, to, carta = false, rest = false, delay = 0, pct }) {
  return (
    <div className={`hm-row${carta ? ' is-carta' : ''}`}>
      <span className="hm-row-label">{label}</span>
      <CountUp className="hm-row-total" from={from} to={to} on={on} delay={delay} money={money} />
      <span className="hm-row-track">
        {parts.map((p, i) => (
          <m.i key={p.k} className={p.cls} style={{ flex: `${p.v} 1 0`, originX: 0 }}
            initial={{ scaleX: 0 }} animate={on ? { scaleX: 1 } : undefined}
            transition={{ ...SPRING.reveal, delay: delay + i * 0.14 }}>
            {pct && p.v / scale >= 0.14 && <span>{pct(p.v)}</span>}
          </m.i>
        ))}
        {rest && <span className="hm-row-rest" style={{ flex: `${scale - parts[0].v} 1 0` }} aria-hidden="true" />}
      </span>
    </div>
  );
}

/** A figure that adds up from `from` to `to` once, in the reader's money
 *  format; tabular, in a box that keeps its final width. Reduced motion
 *  shows the total at once. */
function CountUp({ from, to, on, delay, money, className }) {
  const ref = React.useRef(null);
  const reduce = useReducedMotion();
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (!on || reduce) { el.textContent = money(on || reduce ? to : from); return undefined; }
    const c = animate(from, to, {
      duration: 0.9, delay, ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => { el.textContent = money(Math.round(v)); },
    });
    return () => c.stop();
  }, [on, reduce, from, to, delay, money]);
  return (
    <b className={className}>
      <span className="hm-count-ghost" aria-hidden="true">{money(to)}</span>
      <span className="hm-count" ref={ref} aria-hidden="true">{money(from)}</span>
      <span className="sr-only">{money(to)}</span>
    </b>
  );
}
