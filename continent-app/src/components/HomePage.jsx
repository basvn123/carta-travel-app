import React, { useEffect, useRef, useState } from 'react';
import Logo from './Logo.jsx';
import { OriginPicker } from './OriginPicker.jsx';
import { DateField } from './DateField.jsx';
import { Dropdown } from './Dropdown.jsx';
import { NumberField } from './FilterControls.jsx';
import { LanguagePicker } from './LanguagePicker.jsx';
import { PrivacyPolicy } from './PrivacyPolicy.jsx';
import {
  LuggageIcon, ClockIcon, BusIcon, ChevronRightIcon, ReceiptIcon,
  DiamondIcon, DownloadIcon, PersonIcon,
} from './Icons.jsx';
import { tripDaysBetween } from '../lib/runtime_pricing.js';
import { useI18n } from '../i18n/index.jsx';

const CONTACT = 'bas.vannieuwenhuyse123@gmail.com';

/**
 * A number that counts up from zero when `started` flips true. Honors
 * prefers-reduced-motion by jumping straight to the final value.
 */
function StatNumber({ value, started }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!started) return undefined;
    const reduce = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !(value > 0)) { setShown(value || 0); return undefined; }
    let raf;
    const t0 = performance.now();
    const dur = 1100;
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - (1 - p) ** 3;
      setShown(Math.round(value * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [started, value]);
  return <>{shown.toLocaleString()}</>;
}

/**
 * The always-on homepage: a full-viewport landing page rendered as its own
 * top-level view ('home' in the tab state, now also a first-class tab in the
 * header nav and bottom nav). Laid out like a modern product landing page:
 * sticky nav, two-column hero whose right side is the live trip widget (a
 * real pre-loader that edits app state, so every CTA hands off into an
 * already-priced map), animated stats, feature grid, how-it-works steps, a
 * closing CTA band and a footer with the privacy policy.
 *
 * Sections fade-up as they scroll into view via one IntersectionObserver
 * over [data-reveal] nodes; CSS handles the motion (and turns it off under
 * prefers-reduced-motion).
 */
export function HomePage({
  data, choices, setChoices, onChangeOrigin,
  departDate, setDepartDate, returnDate, setReturnDate, dateBounds,
  reachableCount, totalCount, countryCount,
  user, onOpenAccount,
  onExplore, onPlanTrip, onNavigate,
}) {
  const { t } = useI18n();
  const baggageOpts = data?.meta?.baggage_options || {};
  const originCity = data?.meta?.origins?.[choices.origin]?.city || choices.origin || '';
  const nights = tripDaysBetween(departDate, returnDate);
  const [privacyOpen, setPrivacyOpen] = useState(false);

  // Scroll-reveal for every [data-reveal] node, plus the trigger for the
  // stat counters. Deliberately a scroll sweep rather than an
  // IntersectionObserver: IO only fires on a *change* of intersection, so a
  // jump straight down the page (End key, dragging the scrollbar, a restored
  // scroll position) skips right over the middle sections and leaves them
  // stuck at opacity 0 forever. Measuring positions on each scroll frame
  // reveals anything at or above the fold, however the visitor got there.
  const rootRef = useRef(null);
  const statsRef = useRef(null);
  const [statsIn, setStatsIn] = useState(false);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const els = Array.from(root.querySelectorAll('[data-reveal]'));
    let raf = 0;
    const sweep = () => {
      raf = 0;
      const fold = root.clientHeight * 0.94;
      for (const el of els) {
        if (el.classList.contains('is-in')) continue;
        if (el.getBoundingClientRect().top < fold) el.classList.add('is-in');
      }
      if (statsRef.current && statsRef.current.classList.contains('is-in')) setStatsIn(true);
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(sweep); };
    sweep();
    root.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      root.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  const onDepartChange = (v) => {
    setDepartDate(v);
    if (v && returnDate && returnDate <= v) {
      const d = new Date(v + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + 7);
      const next = d.toISOString().slice(0, 10);
      setReturnDate(dateBounds?.max && next > dateBounds.max ? dateBounds.max : next);
    }
  };

  const features = [
    { Icon: ReceiptIcon, title: t('home.cardTotalTitle'), body: t('home.cardTotalBody') },
    { Icon: LuggageIcon, title: t('welcome.cardBagsTitle'), body: t('welcome.cardBagsBody') },
    { Icon: ClockIcon, title: t('welcome.cardTimeTitle'), body: t('welcome.cardTimeBody') },
    { Icon: BusIcon, title: t('welcome.cardHubsTitle'), body: t('welcome.cardHubsBody') },
    { Icon: DiamondIcon, title: t('home.cardGemsTitle'), body: t('home.cardGemsBody') },
    { Icon: DownloadIcon, title: t('home.cardExportTitle'), body: t('home.cardExportBody') },
  ];

  const navLinks = [
    { key: 'map', label: t('nav.map') },
    { key: 'trip', label: t('nav.trip') },
    { key: 'day', label: t('nav.day') },
  ];

  const accountName = user?.user_metadata?.full_name?.trim() || user?.email;

  return (
    <div className="home-page" ref={rootRef}>
      {/* ── Sticky landing nav ── */}
      <header className="home-nav">
        <div className="home-nav-inner">
          <div className="home-brand">
            <Logo size={40} />
            <div className="brand-text">
              <span className="brand-name">Carta</span>
              <span className="brand-sub">{t('brand.sub')}</span>
            </div>
          </div>
          <nav className="home-nav-links" aria-label="Sections">
            {navLinks.map(({ key, label }) => (
              <button key={key} className="home-nav-link" onClick={() => onNavigate(key)}>
                {label}
              </button>
            ))}
          </nav>
          <div className="home-nav-actions">
            <LanguagePicker />
            <button
              className="home-nav-account"
              onClick={onOpenAccount}
              title={accountName || t('header.accountTitle')}
            >
              {user
                ? <span className="home-nav-initial">{(accountName || '?')[0].toUpperCase()}</span>
                : <PersonIcon size={14} />}
              <span className="home-nav-account-label">
                {user ? t('header.account') : t('gate.signIn')}
              </span>
            </button>
            <button className="home-nav-cta" onClick={onExplore}>
              {t('home.skip')} <ChevronRightIcon size={13} />
            </button>
          </div>
        </div>
      </header>

      <main className="home-main">
        {/* ── Hero: copy left, live trip widget right ── */}
        <section className="home-hero">
          <div className="home-hero-copy">
            <div className="home-proof" data-reveal>
              <span className="home-proof-dot" aria-hidden="true" />
              {t('home.proof', {
                total: totalCount.toLocaleString(),
                countries: countryCount,
              })}
            </div>
            <h1 className="home-headline" data-reveal style={{ '--rv': '70ms' }}>
              {t('welcome.title')}
            </h1>
            <p className="home-sub" data-reveal style={{ '--rv': '140ms' }}>
              {t('welcome.sub')}
            </p>
            <div className="home-hero-ctas" data-reveal style={{ '--rv': '210ms' }}>
              <button className="guide-next home-cta-primary" onClick={onExplore}>
                {t('welcome.explore')} <ChevronRightIcon size={15} />
              </button>
              <button className="home-cta-ghost" onClick={onPlanTrip}>
                {t('welcome.planTrip')}
              </button>
            </div>
            <p className="home-carriers" data-reveal style={{ '--rv': '280ms' }}>
              {t('home.carriers')}
            </p>
          </div>

          <div className="home-hero-widget" data-reveal style={{ '--rv': '160ms' }}>
            <div className="home-trip-back" aria-hidden="true" />
            <div className="welcome-trip home-trip-card">
              <div className="welcome-trip-head">{t('welcome.tripLabel')}</div>
              <div className="welcome-trip-grid">
                <div className="welcome-field welcome-field-origin">
                  <label className="filter-label">{t('origin.from')}</label>
                  <OriginPicker data={data} origin={choices.origin} onChangeOrigin={onChangeOrigin} />
                </div>
                <div className="welcome-field">
                  <label className="filter-label">{t('filter.depart')}</label>
                  <DateField
                    value={departDate || ''}
                    min={dateBounds?.min}
                    max={dateBounds?.max}
                    onChange={onDepartChange}
                  />
                </div>
                <div className="welcome-field">
                  <label className="filter-label">{t('filter.return')}</label>
                  <DateField
                    value={returnDate || ''}
                    min={departDate || dateBounds?.min}
                    max={dateBounds?.max}
                    onChange={(v) => setReturnDate(v)}
                  />
                </div>
                <div className="welcome-field">
                  <label className="filter-label">{t('filter.people')}</label>
                  <NumberField
                    value={choices.group_size}
                    min={1}
                    max={20}
                    onCommit={(v) => setChoices({ ...choices, group_size: v })}
                    ariaLabel={t('filter.people')}
                  />
                </div>
                <div className="welcome-field">
                  <label className="filter-label">{t('filter.baggage')}</label>
                  <Dropdown
                    value={choices.baggage_key}
                    onChange={(key) => {
                      const opt = baggageOpts[key];
                      setChoices({
                        ...choices,
                        baggage_key: key,
                        baggage_per_direction_eur: opt?.per_direction_eur || 0,
                      });
                    }}
                    options={Object.entries(baggageOpts).map(([k, v]) => ({
                      value: k,
                      label: v.label,
                    }))}
                  />
                </div>
              </div>
              {/* Live proof that the widget drives the real app: this count
                  comes from the same pricing pass the map behind runs. */}
              <p className="welcome-live">
                {nights > 0 && <span className="welcome-live-nights">{t('welcome.nights', { n: nights })}</span>}
                {t('welcome.reachable', { n: reachableCount, total: totalCount, city: originCity })}
              </p>
              <button className="home-trip-go" onClick={onExplore}>
                {t('welcome.explore')} <ChevronRightIcon size={13} />
              </button>
            </div>
          </div>
        </section>

        {/* ── Animated stats strip ── */}
        <section className="home-stats" ref={statsRef} data-reveal>
          <div className="home-stat">
            <span className="home-stat-num"><StatNumber value={totalCount} started={statsIn} /></span>
            <span className="home-stat-label">{t('home.statDest')}</span>
          </div>
          <div className="home-stat">
            <span className="home-stat-num"><StatNumber value={countryCount} started={statsIn} /></span>
            <span className="home-stat-label">{t('home.statCountries')}</span>
          </div>
          <div className="home-stat">
            <span className="home-stat-num"><StatNumber value={4} started={statsIn} /></span>
            <span className="home-stat-label">{t('home.statCarriers')}</span>
          </div>
        </section>

        {/* ── Feature grid ── */}
        <section className="home-features">
          <h2 className="home-section-title" data-reveal>{t('home.featuresTitle')}</h2>
          <p className="home-section-sub" data-reveal style={{ '--rv': '70ms' }}>
            {t('home.featuresSub')}
          </p>
          <div className="home-feature-grid">
            {features.map(({ Icon, title, body }, i) => (
              <div className="home-feature-card" key={title} data-reveal style={{ '--rv': `${i * 60}ms` }}>
                <span className="home-feature-icon"><Icon size={18} /></span>
                <b>{title}</b>
                <p>{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── How it works ── */}
        <section className="home-how">
          <h2 className="home-section-title" data-reveal>{t('home.howTitle')}</h2>
          <ol className="home-how-steps">
            {[t('home.step1'), t('home.step2'), t('home.step3')].map((step, i) => (
              <li key={i} data-reveal style={{ '--rv': `${i * 90}ms` }}>
                <span className="home-how-num">{i + 1}</span>
                <p>{step}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ── Closing CTA band ── */}
        <section className="home-band" data-reveal>
          <h2 className="home-band-title">{t('home.ctaTitle')}</h2>
          <p className="home-band-body">{t('home.ctaBody')}</p>
          <div className="home-band-actions">
            <button className="home-band-cta" onClick={onExplore}>
              {t('welcome.explore')} <ChevronRightIcon size={15} />
            </button>
            <button className="home-band-ghost" onClick={onPlanTrip}>
              {t('welcome.planTrip')}
            </button>
          </div>
          <p className="home-band-fine">{t('fareNotice.body1')} {t('fareNotice.body2')}</p>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="home-footer">
        <div className="home-footer-inner">
          <div className="home-footer-grid">
            <div className="home-footer-brand">
              <div className="home-brand">
                <Logo size={36} />
                <div className="brand-text">
                  <span className="brand-name">Carta</span>
                  <span className="brand-sub">{t('brand.sub')}</span>
                </div>
              </div>
              <p className="home-footer-tag">{t('home.footTagline')}</p>
            </div>
            <div className="home-footer-col">
              <h3>{t('home.footProduct')}</h3>
              <ul>
                {navLinks.map(({ key, label }) => (
                  <li key={key}>
                    <button className="home-footer-link" onClick={() => onNavigate(key)}>{label}</button>
                  </li>
                ))}
                <li>
                  <button className="home-footer-link" onClick={onOpenAccount}>{t('header.account')}</button>
                </li>
              </ul>
            </div>
            <div className="home-footer-col">
              <h3>{t('home.footLegal')}</h3>
              <ul>
                <li>
                  <button className="home-footer-link" onClick={() => setPrivacyOpen(true)}>
                    {t('home.footPrivacy')}
                  </button>
                </li>
                <li>
                  <a className="home-footer-link" href={`mailto:${CONTACT}`}>{t('home.footContact')}</a>
                </li>
              </ul>
            </div>
          </div>
          <div className="home-footer-bottom">
            <span>{t('home.footRights', { year: new Date().getFullYear() })}</span>
          </div>
        </div>
      </footer>

      {privacyOpen && <PrivacyPolicy onClose={() => setPrivacyOpen(false)} />}
    </div>
  );
}
