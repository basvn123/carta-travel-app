import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { IconButton } from '../../components/ui/index.js';
import { HeroImage } from '../../components/HeroImage.jsx';
import { ChevronRightIcon } from '../../components/Icons.jsx';
import { formatEst, formatMoney } from '../../lib/money.js';
import { tabHref } from '../../lib/urlState.js';
import { PERSONAS, cheapestDay, exploreHref, isEstimate } from '../../lib/homeDemo.js';
import { useReducedMotion } from './useHome.js';

/**
 * Six travellers and the trip each one comes for (T463), as a rail of photo
 * cards (carta-design "Rails and cuts": scroll-snap, arrows on a fine pointer,
 * arrow keys when focused, no autoplay, no loop, no position figure).
 *
 * Each card is one link: to Explore on its own question (the facets travel in
 * the address, so a new tab keeps them), or for cyclists to Destinations on
 * cycle routes. Its photo carries one solid pill with the cheapest day that
 * question returns at the traveller's Lifestyle (the home page exception's
 * price on a photo); with too few places, or before the guided data arrives,
 * the pill is left out rather than guessed.
 *
 * Props
 *   rows      searchRows() of the catalogue, [] while it loads
 *   guided    the guided search data, null until it arrives
 *   photos    personaPhotos(), or null while the journey index loads
 *   ready     the browser has been idle once (photos wait for it)
 *   door      the page's click handler factory
 *   onSearch  ({ facets }) hands a search to Explore
 *   onCategory (kind) opens Destinations on one kind
 */
export function HomeTravellers({ rows, guided, photos, ready, door, onSearch, onCategory }) {
  const { t } = useI18n();
  const reduced = useReducedMotion();
  const trackRef = React.useRef(null);
  const [edge, setEdge] = React.useState({ start: true, end: false });

  const prices = React.useMemo(() => {
    const out = {};
    for (const p of PERSONAS) out[p.id] = p.facets ? cheapestDay(rows, p.facets, guided) : null;
    return out;
  }, [rows, guided]);

  React.useEffect(() => {
    const el = trackRef.current;
    if (!el) return undefined;
    const read = () => setEdge({
      start: el.scrollLeft <= 2,
      end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2,
    });
    read();
    el.addEventListener('scroll', read, { passive: true });
    window.addEventListener('resize', read);
    return () => { el.removeEventListener('scroll', read); window.removeEventListener('resize', read); };
  }, []);

  const step = (dir) => {
    const el = trackRef.current;
    if (!el) return;
    const card = el.querySelector('li');
    const w = card ? card.getBoundingClientRect().width + parseFloat(getComputedStyle(el).columnGap || '0') : el.clientWidth;
    el.scrollBy({ left: dir * w, behavior: reduced ? 'auto' : 'smooth' });
  };

  const priceText = (cost) => {
    if (!cost) return '';
    const fig = isEstimate(cost) ? formatEst(cost.dayEur, t('money.est')) : formatMoney(cost.dayEur);
    return t('home.from', { price: fig });
  };

  return (
    <section className="home-section home-who" aria-labelledby="home-who-title">
      <div className="home-who-head">
        <h2 id="home-who-title" className="home-h2">{t('home.whoTitle')}</h2>
        <div className="home-rail-arrows">
          <IconButton label={t('home.prev')} disabled={edge.start} onClick={() => step(-1)}>
            <ChevronRightIcon size={20} className="home-flip" />
          </IconButton>
          <IconButton label={t('home.next')} disabled={edge.end} onClick={() => step(1)}>
            <ChevronRightIcon size={20} />
          </IconButton>
        </div>
      </div>
      <ul
        ref={trackRef}
        className="home-who-track"
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
          if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
        }}
      >
        {PERSONAS.map((p) => {
          const photo = photos?.[p.id];
          const price = p.pill ? t(p.pill) : priceText(prices[p.id]);
          const href = p.kind ? tabHref('places') : exploreHref(p.facets);
          const go = p.kind ? () => onCategory(p.kind) : () => onSearch({ facets: p.facets });
          return (
            <li key={p.id}>
              <a className="home-who-card" href={href} onClick={door(go)}>
                <span className="home-who-media">
                  {ready && photo && (
                    <HeroImage url={photo.url} city={t(p.title)} className="home-who-img"
                      maxWidth={960} sizes="(max-width: 768px) 78vw, 300px" ratio={[4, 5]} />
                  )}
                  {price && <span className="home-who-price">{price}</span>}
                </span>
                <span className="home-who-title">{t(p.title)}</span>
                <span className="home-who-body">{t(p.body)}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
