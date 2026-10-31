import React from 'react';
import Logo from './Logo.jsx';
import { useI18n } from '../i18n/index.jsx';
import { tabHref } from '../lib/urlState.js';
import { CONTACT } from '../lib/contact.js';
import { useIsDesktop } from '../hooks/useIsDesktop.js';
import { ChevronDownIcon, GlobeIcon } from './Icons.jsx';
import '../styles/82-site-footer.css';

/**
 * The site footer (T594): the link columns every tab ends with. Every link is
 * a real <a> with the place's own address; a plain click goes through the
 * app's one door (App registers it with setFooterNavigate), a modified click
 * or middle click opens the address in a new tab. The legal texts are
 * ?legal= addresses (LegalFromUrl) and load as their own page.
 */
let navigate = null;
export function setFooterNavigate(fn) { navigate = fn; }

function FooterLink({ href, to, opts, children, external }) {
  const onClick = (e) => {
    if (!to || !navigate) return;
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(to, opts);
  };
  const refresh = (e) => {
    if (to) e.currentTarget.setAttribute('href', href());
  };
  return (
    <a
      className="site-footer-link"
      href={href()}
      onClick={onClick}
      onPointerDown={refresh}
      onFocus={refresh}
      {...(external ? { rel: 'noopener' } : null)}
    >
      {children}
    </a>
  );
}

const CATS = ['trails', 'beaches', 'lakes', 'mountains', 'cycling'];

/**
 * T910 (owner, Explore board 2026-10-30): the footer in the order travel
 * sites use. The logo with one line and the language, then four columns
 * (Explore, Plan, Carta, Legal), then one line: the year, that every price
 * is Carta's own estimate, and the legal links. On a phone the columns fold
 * (each its own disclosure) and the bottom line stays open.
 */
export function SiteFooter() {
  const { t, lang, setLang, languages } = useI18n();
  const wide = useIsDesktop();
  const year = new Date().getFullYear();
  const catHref = (cat) => () => tabHref('places', undefined, { cat });
  const col = (id, heading, items) => (
    <details className="site-footer-col" open={wide || undefined} key={`${id}-${wide ? 'w' : 'n'}`}>
      <summary className="site-footer-h" id={`sf-${id}`}>
        {heading}
        <ChevronDownIcon size={16} className="site-footer-chev" />
      </summary>
      <ul aria-labelledby={`sf-${id}`}>{items.map((it, i) => <li key={i}>{it}</li>)}</ul>
    </details>
  );
  return (
    <footer className="site-footer" aria-label={t('footer.label')}>
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <Logo size={28} />
          <p className="site-footer-line">{t('footer.tagline')}</p>
          {setLang && languages?.length > 1 && (
            <label className="site-footer-lang">
              <GlobeIcon size={16} />
              <span className="sr-only">{t('footer.language')}</span>
              <select value={lang} onChange={(e) => setLang(e.target.value)}>
                {languages.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
              </select>
              <ChevronDownIcon size={14} />
            </label>
          )}
        </div>
        <nav className="site-footer-cols" aria-label={t('footer.label')}>
          {col('explore', t('footer.explore'), [
            <FooterLink to="explore" href={() => tabHref('explore')}>{t('footer.places')}</FooterLink>,
            ...CATS.map((c) => (
              <FooterLink key={c} to="places" opts={{ cat: c }} href={catHref(c)}>{t(`footer.${c}`)}</FooterLink>
            )),
            <FooterLink to="places" opts={{ cat: 'trips' }} href={catHref('trips')}>{t('footer.tripStyles')}</FooterLink>,
          ])}
          {col('plan', t('footer.plan'), [
            <FooterLink to="trip" href={() => tabHref('trip')}>{t('footer.planTrip')}</FooterLink>,
            <FooterLink to="day" href={() => tabHref('day')}>{t('footer.planDay')}</FooterLink>,
            <FooterLink to="trips" href={() => tabHref('trips')}>{t('footer.myTrips')}</FooterLink>,
          ])}
          {col('carta', t('footer.carta'), [
            <FooterLink to="home" href={() => tabHref('home')}>{t('footer.how')}</FooterLink>,
            <FooterLink to="pricing" href={() => tabHref('pricing')}>{t('footer.pricing')}</FooterLink>,
            <FooterLink to="faq" href={() => tabHref('account', undefined, { view: 'faq' })}>{t('footer.faq')}</FooterLink>,
            <a className="site-footer-link" href={`mailto:${CONTACT}`}>{CONTACT}</a>,
          ])}
          {col('legal', t('footer.legal'), [
            <FooterLink href={() => '?legal=terms'}>{t('footer.terms')}</FooterLink>,
            <FooterLink href={() => '?legal=privacy'}>{t('footer.privacy')}</FooterLink>,
            <FooterLink href={() => '?legal=imprint'}>{t('footer.imprint')}</FooterLink>,
            <FooterLink href={() => '?legal=cookies'}>{t('ac2.cookies')}</FooterLink>,
          ])}
        </nav>
        <div className="site-footer-base">
          <p>{t('footer.copyright', { year })} {t('footer.estimates')}</p>
          <nav className="site-footer-legal" aria-label={t('footer.legal')}>
            <FooterLink href={() => '?legal=privacy'}>{t('footer.privacy')}</FooterLink>
            <FooterLink href={() => '?legal=terms'}>{t('footer.terms')}</FooterLink>
            <FooterLink href={() => '?legal=imprint'}>{t('footer.imprint')}</FooterLink>
          </nav>
        </div>
      </div>
    </footer>
  );
}

export default SiteFooter;
