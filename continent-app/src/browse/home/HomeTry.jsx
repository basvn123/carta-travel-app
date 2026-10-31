import React from 'react';
import { m } from 'motion/react';
import { useI18n } from '../../i18n/index.jsx';
import { formatMoney } from '../../lib/money.js';
import { FILM, exploreHref, placeDay } from '../../lib/homeDemo.js';
import { MaskedText, Reveal, SPRING } from './motionKit.jsx';
import { ArrowRight, ICON } from './homeIcons.jsx';

/**
 * Try it (T953; a price ruler since T958, owner 2026-10-31: "more clean and
 * Carta alike"). The visitor's own first search, in the proof's card: a
 * budget a person a day set large, a ruler under it where each of the film's
 * places sits as a dot at its own day price (cheapest first, at the
 * traveller's Lifestyle), then the places as photos. A place over the budget
 * keeps its colour but steps back and says by how much; one under it is lit,
 * and the cheapest that fits is marked best value. The card's foot says how
 * many fit and opens Explore with that budget. Places without a price are
 * left out, never guessed.
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
  const fit = list.filter((p) => p.day <= budget).length;
  // The sentence for screen readers waits for the drag to settle.
  const [said, setSaid] = React.useState('');
  React.useEffect(() => {
    const id = setTimeout(() => setSaid(t('home.tryFitLive', { n: fit, total: list.length, price: money(budget) })), 400);
    return () => clearTimeout(id);
  }, [fit, budget, list.length, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  if (list.length < 3) return null;
  const at = (v) => `${((v - lo) / (hi - lo)) * 100}%`;
  const facets = { budget };
  const go = (e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); onSearch({ facets }); };
  const best = list[0].day <= budget ? list[0].id : null;
  return (
    <section className="hm-try" aria-labelledby="hm-try-title">
      <div className="hm-in">
        <MaskedText as="p" className="hm-kick" parts={[t('home.tryKick')]} />
        <MaskedText id="hm-try-title" className="hm-big" parts={[t('home.tryTitle')]} />
        <Reveal className="hm-try-card">
          <div className="hm-ruler-wrap">
            <label htmlFor="hm-budget" className="hm-budget-label">
              <span>{t('home.tryBudget')}</span>
              <b className="hm-budget-fig">{money(budget)}</b>
            </label>
            <div className="hm-ruler" style={{ '--p': at(budget) }}>
              <span className="hm-ruler-track" aria-hidden="true"><i /></span>
              {list.map((p) => (
                <m.span key={p.id} className={`hm-ruler-dot${p.day <= budget ? ' is-in' : ''}${p.id === best ? ' is-best' : ''}`}
                  style={{ left: at(p.day) }} aria-hidden="true"
                  animate={{ scale: p.day <= budget ? 1 : 0.8 }} transition={{ type: 'spring', visualDuration: 0.3, bounce: 0.45 }} />
              ))}
              <input id="hm-budget" type="range" min={lo} max={hi} step={5} value={budget}
                aria-valuetext={t('home.tryFitLive', { n: fit, total: list.length, price: money(budget) })}
                onChange={(e) => setBudget(Number(e.target.value))} />
            </div>
            <div className="hm-ruler-ends" aria-hidden="true"><span>{money(lo)}</span><span>{money(hi)}</span></div>
          </div>
          <div className="hm-cards">
            {list.map((p, i) => {
              const over = p.day > budget;
              return (
                <m.div key={p.id} className={`hm-card${over ? ' is-over' : ''}`} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.3 }} transition={{ ...SPRING.reveal, delay: i * 0.06 }}>
                  <span className="hm-card-photo">
                    <img src={p.clip.poster} alt="" loading="lazy" decoding="async" />
                    {p.id === best && <span className="hm-card-best">{t('home.tryBest')}</span>}
                  </span>
                  <span className="hm-card-line">
                    <b>{p.name}</b>
                    <strong>{money(p.day)}</strong>
                  </span>
                  <span className="hm-card-over" aria-live="off">{over ? t('home.tryOverBy', { price: money(p.day - budget) }) : t('home.tryFits')}</span>
                </m.div>
              );
            })}
          </div>
          <div className="hm-try-foot">
            <p><b>{t('home.tryFit', { n: fit, total: list.length })}</b><span className="sr-only" aria-live="polite">{said}</span></p>
            <a className="btn btn-primary hm-yours-go" href={exploreHref(facets)} onClick={go}>
              <span className="btn-label">{t('home.trySee', { price: money(budget) })}</span><ArrowRight {...ICON} size={18} weight="bold" aria-hidden="true" />
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
