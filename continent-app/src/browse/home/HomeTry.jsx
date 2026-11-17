import React from 'react';
import { m, useReducedMotion } from 'motion/react';
import { useI18n } from '../../i18n/index.jsx';
import { Blaze, Button, Figure, Formation } from '../../components/ui/index.js';
import { HouseIcon } from '../../components/HouseIcons.jsx';
import { haptic } from '../../lib/haptics.js';
import { formatMoney } from '../../lib/money.js';
import { FILM, exploreHref, placeDay } from '../../lib/homeDemo.js';
import { MaskedText, Reveal, SPRING } from './motionKit.jsx';

/**
 * Try it (T953; a price ruler since T958, owner 2026-10-31: "more clean and
 * Carta alike"; house style 2026-11: the ruler is a short route, each place
 * a stop on it, the thumb the traveller's own painted mark; the budget
 * figure rolls under their drag and a tick lands when they let go). The visitor's own first search, in the proof's card: a
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
  const reduce = useReducedMotion();
  const list = React.useMemo(() => FILM
    .map((f) => { const c = placeDay(rows, f.place); return { ...f, day: c?.dayEur ?? null, stay: c?.stayEur, food: c?.foodEur, name: places?.[f.place]?.city || f.label }; })
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
  // A tick when the traveller lets go on a new budget (a commit), never
  // while dragging and never on pointerdown (DESIGN.md "Interaction").
  const grabbed = React.useRef(null);
  const grab = () => { grabbed.current = budget; };
  const release = (e) => {
    const was = grabbed.current;
    grabbed.current = null;
    if (was != null && Number(e.currentTarget.value) !== was) haptic('tick');
  };
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
        <MaskedText id="hm-try-title" className="hm-big" parts={[t('home.tryTitle')]} />
        <Reveal className="hm-try-card" amount={0.1}>
          <div className="hm-ruler-wrap">
            <label htmlFor="hm-budget" className="hm-budget-label">
              <span>{t('home.tryBudget')}</span>
              {/* still: the figure follows the thumb without a dip on every step; the
                  debounced line below speaks it once the drag settles. */}
              <b className="hm-budget-fig"><Figure value={budget} still /></b>
            </label>
            <div className="hm-ruler" style={{ '--p': at(budget) }}>
              <span className="hm-ruler-track" aria-hidden="true"><i /></span>
              {list.map((p) => (
                <m.span key={p.id} className={`hm-ruler-dot${p.day <= budget ? ' is-in' : ''}${p.id === best ? ' is-best' : ''}${Math.abs(p.day - budget) / (hi - lo) < 0.03 ? ' is-under' : ''}`}
                  style={{ left: at(p.day) }} aria-hidden="true"
                  animate={{ scale: p.day <= budget ? 1 : 0.75 }} transition={SPRING.settle} />
              ))}
              <input id="hm-budget" type="range" min={lo} max={hi} step={5} value={budget}
                aria-valuetext={t('home.tryFitLive', { n: fit, total: list.length, price: money(budget) })}
                onChange={(e) => setBudget(Number(e.target.value))}
                onPointerDown={grab} onPointerUp={release} onKeyDown={grab} onKeyUp={release} />
            </div>
            <div className="hm-ruler-ends" aria-hidden="true"><span>{money(lo)}</span><span>{money(hi)}</span></div>
          </div>
          <div className="hm-cards">
            {list.map((p, i) => (
              <TryCard key={p.id} p={p} i={i} over={p.day > budget} best={p.id === best} reduce={reduce} t={t} money={money} budget={budget} />
            ))}
          </div>
          <div className="hm-try-foot">
            <p><b>{t('home.tryFit', { n: fit, total: list.length })}</b><span className="sr-only" aria-live="polite">{said}</span></p>
            <Button href={exploreHref(facets)} onClick={go} variant="secondary" className="hm-yours-go"
              iconAfter={<HouseIcon.next size={18} />}>
              {t('home.trySee', { price: money(budget) })}
            </Button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/** One place in Try it. Over the budget its photo steps back; the moment the
 *  traveller's own drag brings it within the budget it lifts once (the house
 *  tick, on the card that changed only), never at first paint. The best
 *  value carries the blaze: the one to pick, "here". */
function TryCard({ p, i, over, best, reduce, t, money, budget }) {
  const was = React.useRef(over);
  const [lift, setLift] = React.useState(0);
  React.useEffect(() => {
    if (was.current && !over && !reduce) setLift((n) => n + 1);
    was.current = over;
  }, [over, reduce]);
  return (
    <m.div className={`hm-card${over ? ' is-over' : ''}`} initial={reduce ? false : { opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }} transition={{ ...SPRING.reveal, delay: i * 0.04 }}>
      <m.span key={lift} className="hm-card-photo" initial={lift ? { y: -8 } : false} animate={{ y: 0 }}
        transition={SPRING.tick}>
        <img src={p.clip.poster} alt="" loading="lazy" decoding="async" />
        {best && <span className="hm-card-best"><Blaze size="sm" />{t('home.tryBest')}</span>}
      </m.span>
      <span className="hm-card-line">
        <b>{p.name}</b>
      </span>
      <Formation weighted className="hm-card-price" bed={p.stay} food={p.food} day={p.day} dayLabel={t('home.tryPerDay')} />
      <span className="hm-card-over" aria-live="off">{over ? t('home.tryOverBy', { price: money(p.day - budget) }) : null}</span>
    </m.div>
  );
}
