import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { IconButton } from '../../components/ui/index.js';
import { ChevronRightIcon, GlobeIcon, MapPinIcon, ReceiptIcon, ShareIcon, TicketIcon } from '../../components/Icons.jsx';
import { useReveal } from './useHome.js';

/**
 * Why plan with Carta (T606, the owner's Apple reference: "clean and really
 * professional, but the effects stand out"). Five tall cards in a rail, one
 * promise each, every one a thing the product does today (PRODUCT.md
 * "Product Principles"): no booking and no commission, every estimate
 * marked, the maps app takes over, plan together, six languages. Each card's
 * glyph draws itself once as the rail arrives (stroke-dashoffset); a card
 * lifts 4 px under the pointer. No count, no claim the app cannot back.
 *
 * The rail scrolls sideways with snap points; from 1024 px two round buttons
 * page it, and they are only buttons, never the only way (a trackpad, a
 * swipe and the keyboard reach every card).
 */
const CARDS = [
  { id: 'nobook', Icon: TicketIcon, title: 'home.why1Title', body: 'home.why1' },
  { id: 'marked', Icon: ReceiptIcon, title: 'home.why2Title', body: 'home.why2' },
  { id: 'maps', Icon: MapPinIcon, title: 'home.why3Title', body: 'home.why3' },
  { id: 'together', Icon: ShareIcon, title: 'home.why4Title', body: 'home.why4' },
  { id: 'langs', Icon: GlobeIcon, title: 'home.why5Title', body: 'home.why5' },
];

export function HomeWhy() {
  const { t } = useI18n();
  const reveal = useReveal();
  const railRef = React.useRef(null);
  const page = (dir) => {
    const el = railRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  };
  return (
    <section className="hv-section hv-why" aria-labelledby="hv-why-title" {...reveal}>
      <div className="hv-why-head">
        <h2 id="hv-why-title" className="hv-h2">{t('home.whyTitle')}</h2>
        <div className="hv-why-nav">
          <IconButton label={t('home.prev')} tone="surface" onClick={() => page(-1)}>
            <ChevronRightIcon size={20} className="hv-flip" />
          </IconButton>
          <IconButton label={t('home.next')} tone="surface" onClick={() => page(1)}>
            <ChevronRightIcon size={20} />
          </IconButton>
        </div>
      </div>
      <ul className="hv-why-rail" ref={railRef}>
        {CARDS.map((card, i) => (
          <li key={card.id} className="hv-why-card" style={{ '--i': i }}>
            <h3 className="hv-why-title">{t(card.title)}</h3>
            <p className="hv-why-body">{t(card.body)}</p>
            <span className="hv-why-glyph" aria-hidden="true"><card.Icon size={72} /></span>
          </li>
        ))}
      </ul>
    </section>
  );
}
