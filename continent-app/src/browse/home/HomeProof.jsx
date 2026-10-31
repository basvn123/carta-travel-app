import React from 'react';
import { m, useInView } from 'motion/react';
import { useI18n } from '../../i18n/index.jsx';
import { formatMoney } from '../../lib/money.js';
import { MaskedText, Reveal, SPRING } from './motionKit.jsx';
import { accented, STORY_NIGHTS } from './HomeCost.jsx';
import { ArrowRight, Bed, CalendarBlank, Coins, ICON, UsersThree } from './homeIcons.jsx';

/**
 * The proof (T951, owner 2026-10-31: "more professional, clean"). Two bars
 * on one scale: what a flight site shows (the flight alone, a sliver) and
 * what Carta shows (the flight, the bed and the days, the whole week). One
 * glance says the flight is a small share of the trip. The share is the
 * week's own arithmetic; with no flight in the sweep the section is not
 * shown, since there is nothing to compare.
 *
 * Under it, the promise as a picture rather than a sentence: your dates,
 * your people and how you stay flow into your total, for every place.
 */
export function HomeProof({ week, place, onPlan, planHref }) {
  const { t, lang } = useI18n();
  if (!week?.flight) return null;
  const money = (v) => formatMoney(v, { precision: 'whole', locale: lang });
  const pct = (v) => `${Math.round((v / week.total) * 100)}%`;
  const parts = [
    { k: 'fly', cls: 'is-fly', label: t('home.rcptFlight'), v: week.flight },
    { k: 'bed', cls: 'is-bed', label: t('home.proofBed', { n: STORY_NIGHTS }), v: week.bed },
    { k: 'food', cls: 'is-food', label: t('home.proofFood', { n: STORY_NIGHTS }), v: week.food },
  ];
  return (
    <section className="hm-proof" aria-labelledby="hm-proof-title">
      <div className="hm-in">
        <MaskedText as="p" className="hm-kick" parts={[t('home.proofKick')]} />
        <MaskedText id="hm-proof-title" className="hm-big hm-proof-title" parts={accented(t, 'home.proofTitle', {}, 'pct', pct(week.flight))} />
        <Reveal className="hm-compare">
          <CompareRow label={t('home.proofSites')} total={money(week.flight)} parts={[parts[0]]} scale={week.total} />
          <CompareRow label={t('home.proofCarta')} total={money(week.total)} parts={parts} scale={week.total} carta />
          <div className="hm-legend">
            {parts.map((p) => (
              <span key={p.k}><i className={p.cls} />{p.label}<b>{money(p.v)}</b><em>{pct(p.v)}</em></span>
            ))}
          </div>
          <p className="hm-compare-note">{t('home.proofNote', { place, n: STORY_NIGHTS })}</p>
        </Reveal>
        <Yours onPlan={onPlan} planHref={planHref} />
      </div>
    </section>
  );
}

/** One row of the comparison: a label, the bar on the shared scale, the
 *  figure at its end. The segments grow from the left once, 80 ms apart. */
function CompareRow({ label, total, parts, scale, carta = false }) {
  const ref = React.useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  return (
    <div className={`hm-row${carta ? ' is-carta' : ''}`} ref={ref}>
      <span className="hm-row-label">{label}</span>
      <span className="hm-row-track">
        {parts.map((p, i) => (
          <m.i key={p.k} className={p.cls} style={{ width: `${(p.v / scale) * 100}%`, originX: 0 }}
            initial={{ scaleX: 0 }} animate={inView ? { scaleX: 1 } : undefined}
            transition={{ ...SPRING.reveal, delay: 0.15 + i * 0.08 }} />
        ))}
      </span>
      <b className="hm-row-total">{total}</b>
    </div>
  );
}

/** Your dates, your people and how you stay, flowing into your total. */
function Yours({ onPlan, planHref }) {
  const { t } = useI18n();
  const ref = React.useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const ins = [
    { k: 'dates', Icon: CalendarBlank, label: t('home.inDates') },
    { k: 'people', Icon: UsersThree, label: t('home.inPeople') },
    { k: 'stay', Icon: Bed, label: t('home.inStay') },
  ];
  const go = (e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); onPlan(); };
  return (
    <div className="hm-yours" ref={ref}>
      <MaskedText as="h3" className="hm-yours-title" parts={[t('home.yoursTitle')]} />
      <div className="hm-flow">
        {ins.map((x, i) => (
          <m.span key={x.k} className="hm-in-pill" initial={{ opacity: 0, y: 16 }} animate={inView ? { opacity: 1, y: 0 } : undefined}
            transition={{ ...SPRING.surface, delay: i * 0.08 }}>
            <x.Icon {...ICON} />{x.label}
          </m.span>
        ))}
        <m.span className="hm-flow-line" aria-hidden="true" style={{ originX: 0 }} initial={{ scaleX: 0 }}
          animate={inView ? { scaleX: 1 } : undefined} transition={{ ...SPRING.reveal, delay: 0.3 }}>
          <ArrowRight {...ICON} size={18} weight="bold" />
        </m.span>
        <m.span className="hm-out-pill" initial={{ opacity: 0, scale: 0.92 }} animate={inView ? { opacity: 1, scale: 1 } : undefined}
          transition={{ ...SPRING.surface, delay: 0.6 }}>
          <Coins {...ICON} />{t('home.inTotal')}
        </m.span>
      </div>
      <a className="btn btn-primary hm-yours-go" href={planHref} onClick={go}><span className="btn-label">{t('home.priceYours')}</span></a>
    </div>
  );
}
