import React from 'react';
import Logo from './Logo.jsx';
import { useI18n } from '../i18n/index.jsx';
import { tabHref } from '../lib/urlState.js';
import { CONTACT } from '../lib/contact.js';
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

export function SiteFooter() {
  const { t } = useI18n();
  const year = new Date().getFullYear();
  const catHref = (cat) => () => tabHref('places', undefined, { cat });
  const col = (id, heading, items) => (
    <nav className="site-footer-col" aria-labelledby={`sf-${id}`}>
      <h2 className="site-footer-h" id={`sf-${id}`}>{heading}</h2>
      <ul>{items.map((it, i) => <li key={i}>{it}</li>)}</ul>
    </nav>
  );
  return (
    <footer className="site-footer" aria-label={t('footer.label')}>
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <Logo size={28} />
          <p className="site-footer-line">{t('home.sub')}</p>
        </div>
        <div className="site-footer-cols">
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
          ])}
        </div>
        <p className="site-footer-base">{t('footer.copyright', { year })}</p>
      </div>
    </footer>
  );
}

export default SiteFooter;
