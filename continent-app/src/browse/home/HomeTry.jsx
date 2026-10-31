import React from 'react';
import { m } from 'motion/react';
import { useI18n } from '../../i18n/index.jsx';
import { formatMoney } from '../../lib/money.js';
import { FILM, exploreHref, placeDay } from '../../lib/homeDemo.js';
import { MaskedText, Reveal, SPRING } from './motionKit.jsx';

/**
 * Try it (T953): the visitor's own first search. A budget a person a day;
 * the film's five places at their own day price at the traveller's
 * Lifestyle, cheapest first; a place over the budget greys out and says so.
 * The door opens Explore with that budget. Places without a price are left
 * out, never guessed.
 */
export function HomeTry({ rows, places, onSearch, wide = true }) {
  const { t, lang } = useI18n();
  const money = (v) => formatMoney(v, { precision: 'whole', locale: lang });
  const list = React.useMemo(() => FILM
    .map((f) => ({ ...f, day: placeDay(rows, f.place)?.dayEur ?? null, name: places?.[f.place]?.city || f.label }))
    .filter((f) => f.day != null)
    .sort((a, b) => a.day - b.day)
    // Two whole cards a row on a phone: four places there, five wide.
    .slice(0, wide ? 5 : 4), [rows, places, wide]);
  const lo = list.length ? Math.floor((list[0].day - 10) / 5) * 5 : 50;
  const hi = list.length ? Math.ceil((list[list.length - 1].day + 20) / 5) * 5 : 200;
  const start = list.length > 2 ? Math.ceil(list[2].day / 5) * 5 : hi;
  const [budget, setBudget] = React.useState(start);
  React.useEffect(() => { setBudget(start); }, [start]);
  if (list.length < 3) return null;
  const fit = list.filter((p) => p.day <= budget).length;
  const facets = { budget };
  const go = (e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); onSearch({ facets }); };
  return (
    <section className="hm-try" aria-labelledby="hm-try-title">
      <div className="hm-in">
        <div className="hm-try-head">
          <div>
            <MaskedText as="p" className="hm-kick" parts={[t('home.tryKick')]} />
            <MaskedText id="hm-try-title" className="hm-big" parts={[t('home.tryTitle')]} />
          </div>
          <Reveal className="hm-budget">
            <label htmlFor="hm-budget"><span>{t('home.tryBudget')}</span><b>{money(budget)}</b></label>
            <input id="hm-budget" type="range" min={lo} max={hi} step={5} value={budget}
              style={{ '--p': `${((budget - lo) / (hi - lo)) * 100}%` }}
              onChange={(e) => setBudget(Number(e.target.value))} />
          </Reveal>
        </div>
        <div className="hm-cards">
          {list.map((p, i) => {
            const over = p.day > budget;
            return (
              <m.div key={p.id} className={`hm-card${over ? ' is-over' : ''}`} initial={{ opacity: 0, y: 32 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }} transition={{ ...SPRING.reveal, delay: i * 0.07 }}>
                <span className="hm-card-photo">
                  <img src={p.clip.poster} alt="" loading="lazy" decoding="async" />
                  {i === 0 && !over && <span className="hm-card-best">{t('home.tryBest')}</span>}
                  {over && <span className="hm-card-over">{t('home.tryOver')}</span>}
                </span>
                <b>{p.name}</b>
                <span className="hm-card-price"><strong>{money(p.day)}</strong> {t('home.tryPerDay')}</span>
              </m.div>
            );
          })}
        </div>
        <Reveal className="hm-try-foot">
          <span>{t('home.tryFit', { n: fit, total: list.length })}</span>
          <a className="btn btn-primary" href={exploreHref(facets)} onClick={go}><span className="btn-label">{t('home.trySee', { price: money(budget) })}</span></a>
        </Reveal>
      </div>
    </section>
  );
}
