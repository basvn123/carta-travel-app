import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Money, Tabs } from '../../components/ui/index.js';
import { ChevronRightIcon } from '../../components/Icons.jsx';
import { srcSetFor, thumbAt } from '../../lib/heroImage.js';
import { formatMoney } from '../../lib/money.js';
import { tabHref } from '../../lib/urlState.js';
import { PERSONAS, exploreHref, isEstimate, placeDay } from '../../lib/homeDemo.js';
import { useAutoAdvance, useInView, usePageVisible, useReducedMotion, useReveal } from './useHome.js';

/**
 * Who Carta is for (T606, the owner's Headspace reference: "a nice way to
 * stretch the need"). Six kinds of traveller as tabs, hikers first. Each tab
 * is one exchange: the traveller asks in their own words, the way they would
 * ask Ask Carta, and Carta answers with one real place, its photograph and
 * its own day price, and the door to that search in Explore.
 *
 * The question types itself out when its tab opens (Ask Carta's typing,
 * T569), and the tabs move on every 7 s with a line filling under the row,
 * only while the panel is on screen and the tab visible; the first touch of
 * a tab stops them for good. Under reduced motion nothing types or moves.
 *
 * Props
 *   rows      catalogue rows with day costs
 *   photosOn  load the photographs (the page waits for an idle browser)
 *   door, onSearch, onCategory
 */
export function HomeVoices({ rows, photosOn, door, onSearch, onCategory }) {
  const { t } = useI18n();
  const reveal = useReveal();
  const panelRef = React.useRef(null);
  const onScreen = useInView(panelRef, { threshold: 0.35 });
  const visible = usePageVisible();
  const reduced = useReducedMotion();
  const run = useAutoAdvance(PERSONAS.length, { ms: 7000, running: onScreen && visible && !reduced });
  const p = PERSONAS[run.index];
  const cost = placeDay(rows, p.place);
  const question = t(p.ask, p.askPrice ? { price: formatMoney(p.askPrice) } : undefined);
  const typed = useTyped(question, !reduced && onScreen);
  const answer = p.kind === 'cycling'
    ? { href: tabHref('places'), go: () => onCategory('cycling'), label: t('home.seeRoutes') }
    : { href: exploreHref(p.facets), go: () => onSearch({ facets: p.facets }), label: t('home.seeLikeThis') };

  return (
    <section className="hv-section hv-voices" aria-labelledby="hv-voices-title" {...reveal}>
      <h2 id="hv-voices-title" className="hv-h2">{t('home.whoTitle')}</h2>
      <div className="hv-voices-tabs" onPointerDown={run.hold}>
        <Tabs label={t('home.whoTitle')} panelId="hv-voices-panel" value={p.id}
          tabs={PERSONAS.map((x) => ({ id: x.id, label: t(x.title) }))}
          onChange={(id) => run.pick(PERSONAS.findIndex((x) => x.id === id))} />
        {run.live && <span key={run.index} className="hv-advance" aria-hidden="true" />}
      </div>

      <div id="hv-voices-panel" role="tabpanel" className="hv-panel hv-voices-panel" ref={panelRef}
        onFocusCapture={run.hold} onPointerDown={run.hold}>
        <div className="hv-chat">
          <div className="hv-say hv-say-you">
            <span className="hv-say-who">{t('home.you')}</span>
            <p className="hv-say-text">
              <span className="sr-only">{question}</span>
              <span aria-hidden="true">{typed}<span className={`hv-caret${typed.length < question.length ? ' is-typing' : ''}`} /></span>
            </p>
          </div>
          <div key={p.id} className={`hv-say hv-say-carta${typed.length >= question.length ? ' is-in' : ''}`}>
            <span className="hv-say-who">Carta</span>
            <div className="hv-answer">
              <div className="hv-answer-head">
                <span className="hv-answer-name">{p.label || t(p.title)}</span>
                {cost ? (
                  <span className="hv-answer-fig"><Money value={cost.dayEur} est={isEstimate(cost)} /> <span className="hv-unit">{t('home.aDayUnit')}</span></span>
                ) : p.pill ? <span className="hv-answer-fig">{t(p.pill)}</span> : null}
              </div>
              <p className="hv-answer-text">{t(p.body)}</p>
              <a className="hv-door" href={answer.href} onClick={door(answer.go)}>
                {answer.label}<ChevronRightIcon size={16} aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>
        <figure className="hv-voices-photo">
          {photosOn && p.photo ? (
            <img key={p.id} src={thumbAt(p.photo.url, 960)} srcSet={srcSetFor(p.photo.url, 1280)}
              sizes="(min-width: 1024px) 520px, 100vw" alt="" style={{ objectPosition: p.photo.focus }}
              loading="lazy" decoding="async" />
          ) : <span className="hv-photo-wait" aria-hidden="true" />}
          {p.photo && (
            <figcaption className="hv-caption">
              <a href={p.photo.page} target="_blank" rel="noopener noreferrer">{p.photo.credit}</a>
              {t('home.photoBy', { who: p.photo.author, licence: p.photo.licence })}
            </figcaption>
          )}
        </figure>
      </div>
    </section>
  );
}

/** The text typed out, about 28 ms a letter, from the start whenever the
 *  text changes; all of it at once when typing is off. */
function useTyped(text, on) {
  const [n, setN] = React.useState(on ? 0 : text.length);
  React.useEffect(() => {
    if (!on) { setN(text.length); return undefined; }
    setN(0);
    let i = 0;
    const h = setInterval(() => {
      i += 1;
      setN(i);
      if (i >= text.length) clearInterval(h);
    }, 28);
    return () => clearInterval(h);
  }, [text, on]);
  return text.slice(0, n);
}
