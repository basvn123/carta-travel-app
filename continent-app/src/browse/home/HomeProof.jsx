import React from 'react';
import { m, useInView } from 'motion/react';
import { useI18n } from '../../i18n/index.jsx';
import { Button } from '../../components/ui/index.js';
import { HouseIcon } from '../../components/HouseIcons.jsx';
import { formatMoney } from '../../lib/money.js';
import { MaskedText, SPRING } from './motionKit.jsx';
import { accented, STORY_NIGHTS } from './HomeCost.jsx';

/**
 * The proof (T951; one card since T955; house style 2026-11, home lane). Two
 * bars on one scale: what a flight site shows (the flight alone, the rest of
 * the week an empty dashed track) and what Carta shows (the flight, the bed
 * and the days, in the formation's colours: getting there outlined, the bed
 * solid umber, food and drink beige). Under them each cost's share and what
 * moves it; the foot holds the one line and the door. Every figure is
 * printed whole from the first paint (no count-up, PRODUCT.md); only the
 * bars draw once, the first time they come into view. With no flight in
 * the sweep the section is not shown.
 */
export function HomeProof({ week, onPlan, planHref }) {
  const { t, lang } = useI18n();
  const ref = React.useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.45 });
  const money = React.useCallback((v) => formatMoney(v, { precision: 'whole', locale: lang }), [lang]);
  if (!week?.flight) return null;
  const pct = (v) => `${Math.round((v / week.total) * 100)}%`;
  const parts = [
    { k: 'fly', cls: 'is-fly', Icon: HouseIcon.flight, label: t('home.rcptFlight'), by: t('home.proofFlyBy'), v: week.flight },
    { k: 'bed', cls: 'is-bed', Icon: HouseIcon.bed, label: t('home.proofBed', { n: STORY_NIGHTS }), by: t('home.proofBedBy'), v: week.bed },
    { k: 'food', cls: 'is-food', Icon: HouseIcon.food, label: t('home.proofFood', { n: STORY_NIGHTS }), by: t('home.proofFoodBy'), v: week.food },
  ];
  const go = (e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); onPlan(); };
  return (
    <section className="hm-proof" aria-labelledby="hm-proof-title">
      <div className="hm-in">
        <MaskedText id="hm-proof-title" className="hm-big hm-proof-title" parts={accented(t, 'home.proofTitle', {}, 'pct', pct(week.flight))} />
        <div className={`hm-compare${inView ? ' is-in' : ''}`} ref={ref}>
          <div className="hm-bars">
            <BarRow label={t('home.proofSites')} parts={[parts[0]]} scale={week.total} on={inView} total={money(week.flight)} rest />
            <BarRow label={t('home.proofCarta')} parts={parts} scale={week.total} on={inView} total={money(week.total)} carta delay={0.2} pct={pct} />
          </div>
          <ul className="hm-costs">
            {parts.map((p) => (
              <li key={p.k} className={`hm-cost-line ${p.cls}`}>
                <span className="hm-cost-ico" aria-hidden="true"><p.Icon size={18} /></span>
                <span className="hm-cost-name">{p.label}<small>{p.by}</small></span>
                <span className="hm-cost-fig"><b>{money(p.v)}</b><em>{pct(p.v)}</em></span>
              </li>
            ))}
          </ul>
          <div className="hm-compare-foot">
            <p>{t('home.proofFoot')}</p>
            <Button href={planHref} onClick={go} variant="secondary" className="hm-yours-go"
              iconAfter={<HouseIcon.next size={18} />}>
              {t('home.priceYours')}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

/** One row: a label, its whole figure, and the bar on the shared scale.
 *  The segments draw from the left once (the bar is the moving thing, never
 *  the figure); the flight site's row shows the rest of the week as an
 *  empty dashed track. */
function BarRow({ label, parts, scale, on, total, carta = false, rest = false, delay = 0, pct }) {
  return (
    <div className={`hm-row${carta ? ' is-carta' : ''}`}>
      <span className="hm-row-label">{label}</span>
      <b className="hm-row-total">{total}</b>
      <span className="hm-row-track" aria-hidden="true">
        {parts.map((p, i) => (
          <m.i key={p.k} className={p.cls} style={{ flex: `${p.v} 1 0`, originX: 0 }}
            initial={{ scaleX: 0 }} animate={on ? { scaleX: 1 } : undefined}
            transition={{ ...SPRING.reveal, delay: delay + i * 0.1 }}>
            {pct && p.v / scale >= 0.14 && <span>{pct(p.v)}</span>}
          </m.i>
        ))}
        {rest && <span className="hm-row-rest" style={{ flex: `${scale - parts[0].v} 1 0` }} />}
      </span>
    </div>
  );
}
