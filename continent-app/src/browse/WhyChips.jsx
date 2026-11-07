import React from 'react';
import { useI18n } from '../i18n/index.jsx';
import { useTasteVerdicts } from '../lib/taste/store.js';
import { asOfFor, formatDay, isStale } from '../lib/asOf.js';
import { useTaste } from './WhyItMatches.jsx';
import { PSection } from './PageTemplate.jsx';
import '../styles/80-why.css';

/**
 * Trust made visible (T1208, ROADMAP G9).
 *
 *   <WhyChips place={p} />           a card's chips: up to two reasons this
 *                                    place fits the traveller, nothing when
 *                                    there is no evidence on both sides
 *   <WhyPlace destination={d} />     the place page's "Why this place": the
 *                                    same reasons with their evidence and
 *                                    confidence in words, then what the place
 *                                    is known for
 *   <PricesRefreshed record={d} />   "Prices refreshed 7 Jun 2026" under the
 *                                    day price, from the blocks' `_asof`
 *
 * The rules (what counts as evidence, the two confidence words, the dates)
 * live in lib/why.js and lib/asOf.js. lib/why.js carries the taxonomy map
 * (about 10 KB gzip), so it loads on demand: a card asks for it only when
 * the traveller has a Yes or a picked like, the place page always. Chips are text inside the card's link,
 * never a second control in it. Scoped CSS: styles/80-why.css (.why).
 */

// lib/why.js, loaded once on demand and shared by every chip.
let whyMod = null;
let whyLoad = null;
function useWhyModule(wanted) {
  const [mod, setMod] = React.useState(whyMod);
  React.useEffect(() => {
    if (!wanted || whyMod) return undefined;
    let live = true;
    whyLoad = whyLoad || import('../lib/why.js');
    whyLoad.then((m) => { whyMod = m; if (live) setMod(m); }, () => { whyLoad = null; });
    return () => { live = false; };
  }, [wanted]);
  return mod || whyMod;
}

/** The traveller's side, live: Yes and Not me in "Your taste" plus the picked likes. */
function useTraveller(always = false) {
  const { verdicts } = useTasteVerdicts();
  const taste = useTaste();
  const likes = taste?.likes;
  const hasYes = (likes?.length || 0) > 0 || Object.values(verdicts || {}).some((x) => x?.v === 'accept');
  const why = useWhyModule(always || hasYes);
  const traveller = React.useMemo(
    () => (why ? why.travellerNodes({ verdicts, likes }) : null),
    [why, verdicts, likes],
  );
  return { why, traveller };
}

/** The chip's words: the node, with "(likely)" under the strong bar. */
function chipText(why, c, t, lang) {
  const label = why.whyLabel(c.node, lang);
  return c.conf === 'likely' ? t('why.place.chipLikely', { label }) : label;
}

/** The traveller's evidence in words. */
function youText(why, you, t, lang) {
  if (you.kind === 'accepted') return t('why.place.youYes', { node: why.whyLabel(you.node, lang) });
  return t('why.place.youLike', { like: t(`pf.like.${you.like}`) });
}

/** The place's evidence in words. A quote is English, so only English shows it (T446). */
function placeText(tag, t, lang) {
  const ev = tag.evidence[0];
  if (ev?.kind === 'quote') return lang === 'en' ? t('why.place.evQuote', { text: ev.text }) : t('why.place.evText');
  return t('why.place.evListing');
}

/** Up to two chips on a card; nothing without evidence. */
export function WhyChips({ place, className = '' }) {
  const { t, lang } = useI18n();
  const { why, traveller } = useTraveller();
  const chips = React.useMemo(() => (why && traveller ? why.whyChips(place, traveller) : []), [why, place, traveller]);
  if (!chips.length) return null;
  const words = chips.map((c) => chipText(why, c, t, lang));
  return (
    <span className={`why why-chips ${className}`.trim()} data-why={chips.map((c) => c.node).join(' ')}>
      <span className="sr-only">{t('why.place.cardAria', { list: words.join(', ') })}</span>
      {chips.map((c, i) => (
        <span key={c.node} className={`why-chip is-${c.conf}`} aria-hidden="true">{words[i]}</span>
      ))}
    </span>
  );
}

function WhyRow({ why, tag, you, t, lang }) {
  return (
    <li className={`why-row is-${tag.conf}`} data-node={tag.node}>
      <span className="why-row-top">
        <span className="why-row-name">{why.whyLabel(tag.node, lang)}</span>
        <span className="why-conf">{t(`why.place.conf.${tag.conf}`)}</span>
      </span>
      {you && <span className="why-row-ev why-you">{youText(why, you, t, lang)}</span>}
      <span className="why-row-ev">{placeText(tag, t, lang)}</span>
    </li>
  );
}

/** The place page's section: the reasons for this traveller, then what it is known for. */
export function WhyPlace({ destination, tagged = null }) {
  const { t, lang } = useI18n();
  const { why, traveller } = useTraveller(true);
  const chips = React.useMemo(
    () => (why && traveller ? why.whyChips(destination, traveller, { tagged, max: 4 }) : []),
    [why, destination, traveller, tagged],
  );
  const known = React.useMemo(
    () => (why ? why.knownFor(destination, { tagged, skip: chips.map((c) => c.node), no: traveller?.no }) : []),
    [why, destination, tagged, chips, traveller],
  );
  if (!chips.length && !known.length) return null;
  return (
    <PSection id="pt-why" title={t('why.place.title')} className="why why-place">
      {chips.length > 0 && (
        <div className="why-group">
          <h3 className="why-sub">{t('why.place.forYou')}</h3>
          <ul className="why-list">
            {chips.map((c) => <WhyRow key={c.node} why={why} tag={c} you={c.you} t={t} lang={lang} />)}
          </ul>
        </div>
      )}
      {known.length > 0 && (
        <div className="why-group">
          <h3 className="why-sub">{t('why.place.known')}</h3>
          <ul className="why-list">
            {known.map((c) => <WhyRow key={c.node} why={why} tag={c} t={t} lang={lang} />)}
          </ul>
        </div>
      )}
    </PSection>
  );
}

/** "Prices refreshed 7 Jun 2026" from the oldest of the price blocks; nothing without a stamp. */
export function PricesRefreshed({ record, now }) {
  const { t, lang, languages } = useI18n();
  const iso = asOfFor(record, 'prices');
  if (!iso) return null;
  const bcp47 = languages?.find((l) => l.code === lang)?.bcp47 || 'en-GB';
  const date = formatDay(iso, bcp47);
  const stale = isStale('prices', iso, now ?? Date.now());
  return (
    <p className={`why why-asof${stale ? ' is-stale' : ''}`} data-asof={iso}>
      <time dateTime={iso}>{t(stale ? 'why.place.mayHaveChanged' : 'why.place.pricesRefreshed', { date })}</time>
    </p>
  );
}
