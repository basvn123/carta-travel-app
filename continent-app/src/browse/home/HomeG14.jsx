import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button } from '../../components/ui/index.js';
import { SiteFooter } from '../../components/SiteFooter.jsx';
import WaitlistForm from '../../components/WaitlistForm.jsx';
import { formatMoney } from '../../lib/money.js';
import { priceDay, priceRequest } from '../../lib/price/index.js';
import { tabHref } from '../../lib/urlState.js';
import { EXAMPLE_PLACE, SAMPLE_JOURNEY, dayParts, pricedMonth, sampleHref, shareUrl } from './homeVariant.js';
import '../../styles/63-home-g14.css';

/**
 * The G14 home page (T1209, ROADMAP G14), behind the HOME_G14 flag in
 * homeVariant.js until the owner approves the design direction (T1111-a).
 * Persuade mode, built to load fast: no film, no recordings, no motion
 * library, so the first paint is the promise itself.
 *
 *   Promise   the mission's short form in one line (home.title), one line
 *             under it, and the two doors: Explore and a sample trip
 *   Example   one real day: Bled this month, a person, its bed and its food
 *             and drink at the traveller's Lifestyle, on the umber cost card
 *             (direction section 3); hidden when the place has no price
 *   Waitlist  the K3 form, then the referral link (one fixed link, counted
 *             by the K12 channel counts as referral, no person in it)
 *
 * Props
 *   data          { destinations }
 *   choices       App's choices (Lifestyle, stay tier, party)
 *   pageOver      a page or panel stands over the home page (no h1 then)
 *   onNavigate    goToTab(key)
 *   onOpenDest    opens a destination page by id
 *   onOpenJourney opens a published trip by id
 */

/** A plain click runs the app's door; a modifier click is the browser's. */
const door = (fn) => (e) => {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
  e.preventDefault();
  fn();
};

export default function HomeG14({ data, choices, pageOver = false, onNavigate, onOpenDest, onOpenJourney }) {
  const { t, lang } = useI18n();
  const destinations = data?.destinations || null;
  const place = destinations?.[EXAMPLE_PLACE] || null;
  const month = new Date().getMonth() + 1;

  // This month's day at the traveller's Lifestyle: the same price engine and
  // request Explore uses, with the month set to the current one. Priced after
  // the first paint (it reads the whole catalogue for the country repair), so
  // the promise paints first and the card arrives a moment later.
  const [day, setDay] = React.useState(null);
  React.useEffect(() => {
    if (!place) return undefined;
    let live = true;
    const run = () => {
      if (!live) return;
      const cost = priceDay(place, priceRequest({ choices: { ...choices, price_excluded: [] }, xm: month }), destinations);
      setDay(dayParts(cost));
    };
    const idle = typeof window !== 'undefined' && window.requestIdleCallback;
    const id = idle ? idle(run, { timeout: 1500 }) : setTimeout(run, 0);
    return () => { live = false; if (idle) window.cancelIdleCallback(id); else clearTimeout(id); };
  }, [place, choices, month, destinations]);

  const money = (v) => formatMoney(v, { precision: 'whole', locale: lang });
  const Title = pageOver ? 'div' : 'h1';
  const exploreHref = tabHref('map');

  return (
    <div className="hv-page hg-page" data-testid="home-g14">
      <section className="hg-hero" aria-labelledby="hg-title">
        <div className="hg-in">
          <p className="hg-kick">{t('home.gKick')}</p>
          <Title id="hg-title" className="hg-title">{t('home.title')}</Title>
          <p className="hg-sub">{t('home.sub')}</p>
          <div className="hg-doors">
            <Button href={exploreHref} variant="primary" className="hg-go" onClick={door(() => onNavigate('map'))}>
              {t('home.gExplore')}<span className="hg-arrow" aria-hidden="true">{'→'}</span>
            </Button>
            <a className="hg-link" href={sampleHref()} onClick={door(() => onOpenJourney(SAMPLE_JOURNEY))}>{t('home.gSample')}</a>
          </div>
        </div>
      </section>

      {day && (
        <section className="hg-in hg-example" aria-labelledby="hg-day-title">
          <article className="hg-card">
            <div className="hg-card-main">
              <p className="hg-card-kick">{t('home.gDayKick')}</p>
              <h2 id="hg-day-title" className="hg-card-title">{t('home.gDayTitle', { place: place.city, month: pricedMonth(null, lang) })}</h2>
              <p className="hg-total"><span className="hg-total-fig">{money(day.total)}</span><span className="hg-total-unit">{t('home.gDayUnit')}</span></p>
              <div className="hg-bar" aria-hidden="true">
                {day.parts.map((p, i) => (
                  <span key={p.key} className={`hg-seg hg-seg-${p.key}`} style={{ '--w': `${p.share}%`, '--i': i }} />
                ))}
              </div>
              <ul className="hg-lines">
                {day.parts.map((p) => (
                  <li key={p.key} className={`hg-line hg-line-${p.key}`}>
                    <span className="hg-dot" aria-hidden="true" />
                    <span className="hg-line-label">{t(p.key === 'stay' ? 'home.gBed' : 'home.gFood')}<small>{t(p.key === 'stay' ? 'home.gBedLine' : 'home.gFoodLine')}</small></span>
                    <b className="hg-line-fig">{money(p.eur)}</b>
                  </li>
                ))}
              </ul>
            </div>
            <div className="hg-foot">
              <p className="hg-foot-line">{t('home.gDayFoot')}</p>
              <Button href={`#dest=${encodeURIComponent(EXAMPLE_PLACE)}`} variant="primary" className="hg-go" onClick={door(() => onOpenDest(EXAMPLE_PLACE))}>
                {t('home.gOpen', { place: place.city })}<span className="hg-arrow" aria-hidden="true">{'→'}</span>
              </Button>
            </div>
          </article>
        </section>
      )}

      <div className="hg-in hg-join">
        <WaitlistForm source="home_g14" />
        <ShareCarta t={t} />
      </div>
      <SiteFooter />
    </div>
  );
}

/**
 * The referral half of K3, on the client only: the system share sheet where
 * the browser has one, else the link to the clipboard, else a field to copy
 * from by hand. One link for everyone, so nobody is tracked.
 */
function ShareCarta({ t }) {
  const url = shareUrl(typeof window !== 'undefined' ? window.location.origin : '');
  const [state, setState] = React.useState('idle'); // idle, copied, manual
  const share = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: 'Carta', text: t('home.title'), url });
        return;
      }
    } catch (e) {
      if (e?.name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setState('copied');
    } catch {
      setState('manual');
    }
  };
  return (
    <section className="hg-share" aria-labelledby="hg-share-title">
      <h2 id="hg-share-title" className="hg-share-title">{t('home.gShareTitle')}</h2>
      <p className="hg-share-lead">{t('home.gShareLead')}</p>
      <div className="hg-share-row">
        <Button variant="secondary" onClick={share}>{t('home.gShare')}</Button>
        {state === 'copied' && <span className="hg-share-ok" role="status">{t('home.gCopied')}</span>}
      </div>
      {state === 'manual' && (
        <>
          <label className="sr-only" htmlFor="hg-share-url">{t('home.gCopyLabel')}</label>
          <input id="hg-share-url" className="hg-share-url wl-input" readOnly value={url} onFocus={(e) => e.target.select()} />
        </>
      )}
    </section>
  );
}
