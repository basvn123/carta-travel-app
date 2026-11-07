import React from 'react';
import { useI18n } from '../i18n/index.jsx';
import { Button } from './ui/index.js';
import { joinWaitlist, validEmail } from '../lib/waitlist.js';
import '../styles/94-waitlist.css';

/**
 * The waitlist and newsletter form (T1110, ROADMAP K3): one field, one
 * button, double opt-in. Shown on the Home page after the closing question.
 * The line under the field says what happens: one confirmation mail, nothing
 * else until the link is clicked, unsubscribe in every mail.
 */
export default function WaitlistForm({ source = 'home' }) {
  const { t, lang } = useI18n();
  const [email, setEmail] = React.useState('');
  const [state, setState] = React.useState('idle'); // idle, busy, done, email, unavailable
  const onSubmit = async (e) => {
    e.preventDefault();
    if (state === 'busy') return;
    if (!validEmail(email)) { setState('email'); return; }
    setState('busy');
    setState(await joinWaitlist({ email, locale: lang, source }) === 'ok' ? 'done' : 'unavailable');
  };
  const bad = state === 'email' || state === 'unavailable';
  return (
    <section className="hv-section wl" aria-labelledby="wl-title" data-testid="waitlist">
      <h2 id="wl-title" className="hv-h2 wl-title">{t('waitlist.title')}</h2>
      <p className="wl-lead">{t('waitlist.lead')}</p>
      {state === 'done' ? (
        <p className="wl-done" role="status">{t('waitlist.done')}</p>
      ) : (
        <form className="wl-form" onSubmit={onSubmit} noValidate>
          <label className="sr-only" htmlFor="wl-email">{t('waitlist.label')}</label>
          <input
            id="wl-email" className="wl-input" type="email" name="email" autoComplete="email" inputMode="email"
            placeholder={t('waitlist.placeholder')} value={email} maxLength={254}
            aria-invalid={bad || undefined} aria-describedby={bad ? 'wl-msg' : 'wl-fine'}
            onChange={(e) => { setEmail(e.target.value); if (state !== 'busy') setState('idle'); }}
          />
          <Button type="submit" variant="primary" disabled={state === 'busy'}>{t('waitlist.button')}</Button>
          {bad && <p id="wl-msg" className="wl-msg" role="alert">{t(state === 'email' ? 'waitlist.badEmail' : 'waitlist.unavailable')}</p>}
        </form>
      )}
      <p id="wl-fine" className="wl-fine">{t('waitlist.fine')}</p>
    </section>
  );
}
