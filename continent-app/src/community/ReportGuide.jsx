import React, { useEffect, useId, useRef, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { AlertIcon, CheckIcon } from '../components/Icons.jsx';
import { reportGuide } from './guides.js';

// The shape report_guide (037) accepts, checked here first so the common
// mistakes get a sentence before a round trip. The database checks again;
// this is a courtesy, not the gate.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@.]+$/;
const REASON_MIN = 10;
const REASON_MAX = 4000;
const NAME_MAX = 200;

/**
 * ReportGuide, the notice form at the foot of a public guide.
 *
 * WHY IT EXISTS. Article 16 of the Digital Services Act asks every hosting
 * service in the EU for an electronic, easy to reach way for anyone to
 * report content they believe is illegal. A public guide is hosted content,
 * so every guide carries this control, signed in or not: report_guide is
 * granted to anon, and a visitor who opened a shared link without an
 * account is exactly who is likely to see something wrong.
 *
 * SHAPE. Closed, it is one secondary button under the privacy note, so it
 * is always there and never louder than the guide. Open, it asks for what
 * the notice needs (what is wrong and why, an optional email for the
 * decision, an optional name) and the notifier's confirmation that the
 * notice is made in good faith (Article 16(2)(d); required by the database
 * since migration 051, owner decision of 2026-10-07, T068-d). It has the
 * view's only filled button. The email and the name are optional on
 * purpose: a notice without contact details is still a notice.
 *
 * ERRORS are the RPC's words turned into one sentence each: too_many (five
 * an hour from one source), not_public (unpublished since it was opened),
 * bad_reason, bad_email, bad_name, good_faith_required. Anything else,
 * including a project where 051 is not applied yet, says it did not send
 * and keeps what was typed.
 */
export function ReportGuide({ planId }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [goodFaith, setGoodFaith] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState(false);
  const reasonRef = useRef(null);
  const faithRef = useRef(null);
  const openRef = useRef(null);
  const formId = useId();
  const reasonId = `${formId}-reason`;
  const emailId = `${formId}-email`;
  const emailHintId = `${formId}-email-hint`;
  const nameId = `${formId}-name`;
  const nameHintId = `${formId}-name-hint`;
  const faithId = `${formId}-faith`;
  const errId = `${formId}-err`;

  // Opening moves focus into the form, so a keyboard or screen reader user
  // lands where the typing happens rather than on a button that vanished.
  useEffect(() => {
    if (open && !sent) reasonRef.current?.focus();
  }, [open, sent]);

  const close = () => {
    setOpen(false);
    setErr('');
    // Back to the control that opened it, which is visible again.
    requestAnimationFrame(() => openRef.current?.focus());
  };

  const errFor = (code) => {
    if (code === 'too_many') return t('guides.reportErrTooMany');
    if (code === 'not_public') return t('guides.reportErrGone');
    if (code === 'bad_reason') return t('guides.reportErrShort');
    if (code === 'bad_email') return t('guides.reportErrEmail');
    if (code === 'bad_name') return t('guides.reportErrName');
    if (code === 'good_faith_required') return t('guides.reportErrGoodFaith');
    return t('guides.reportErrGeneric');
  };

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const r = reason.trim();
    const m = email.trim();
    const n = name.trim();
    if (r.length < REASON_MIN) { setErr(errFor('bad_reason')); reasonRef.current?.focus(); return; }
    if (m && (m.length > 254 || !EMAIL_RE.test(m))) { setErr(errFor('bad_email')); return; }
    if (n.length > NAME_MAX) { setErr(errFor('bad_name')); return; }
    if (!goodFaith) { setErr(errFor('good_faith_required')); faithRef.current?.focus(); return; }
    setBusy(true);
    setErr('');
    try {
      await reportGuide(planId, r, m || null, n || null, goodFaith);
      setSent(true);
      setReason('');
      setEmail('');
      setName('');
      setGoodFaith(false);
    } catch (x) {
      setErr(errFor(x?.code));
    }
    setBusy(false);
  };

  if (sent) {
    return (
      <div className="gld-report-done" role="status">
        <CheckIcon size={16} />
        <p>{t('guides.reportSent')}</p>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        ref={openRef}
        type="button"
        className="gld-copy gld-report-open"
        aria-expanded="false"
        onClick={() => setOpen(true)}
      >
        <AlertIcon size={13} />
        {t('guides.reportOpen')}
      </button>
    );
  }

  return (
    <form className="gld-report" onSubmit={submit} noValidate aria-labelledby={`${formId}-title`}>
      <div className="section-title" id={`${formId}-title`}>{t('guides.reportTitle')}</div>
      <p className="gld-report-lede">{t('guides.reportLede')}</p>
      <div className="auth-field">
        <label className="auth-label" htmlFor={reasonId}>{t('guides.reportReasonLabel')}</label>
        <textarea
          ref={reasonRef}
          id={reasonId}
          className="account-feedback-input"
          rows={5}
          maxLength={REASON_MAX}
          required
          aria-invalid={err === errFor('bad_reason') ? 'true' : undefined}
          aria-describedby={err ? errId : undefined}
          value={reason}
          onChange={(e) => { setReason(e.target.value); setErr(''); }}
          placeholder={t('guides.reportReasonPlaceholder')}
        />
      </div>
      <div className="auth-field">
        <label className="auth-label" htmlFor={emailId}>{t('guides.reportEmailLabel')}</label>
        <input
          id={emailId}
          type="email"
          inputMode="email"
          autoComplete="email"
          maxLength={254}
          aria-invalid={err === errFor('bad_email') ? 'true' : undefined}
          aria-describedby={emailHintId}
          value={email}
          onChange={(e) => { setEmail(e.target.value); setErr(''); }}
          placeholder="name@example.com"
        />
        <p className="auth-hint" id={emailHintId}>{t('guides.reportEmailHint')}</p>
      </div>
      <div className="auth-field">
        <label className="auth-label" htmlFor={nameId}>{t('guides.reportNameLabel')}</label>
        <input
          id={nameId}
          type="text"
          autoComplete="name"
          maxLength={NAME_MAX}
          aria-invalid={err === errFor('bad_name') ? 'true' : undefined}
          aria-describedby={nameHintId}
          value={name}
          onChange={(e) => { setName(e.target.value); setErr(''); }}
        />
        <p className="auth-hint" id={nameHintId}>{t('guides.reportNameHint')}</p>
      </div>
      <label className="auth-check" htmlFor={faithId}>
        <input
          ref={faithRef}
          id={faithId}
          type="checkbox"
          required
          checked={goodFaith}
          aria-invalid={err === errFor('good_faith_required') ? 'true' : undefined}
          aria-describedby={err ? errId : undefined}
          onChange={(e) => { setGoodFaith(e.target.checked); setErr(''); }}
        />
        <span>{t('guides.reportGoodFaith')}</span>
      </label>
      {err && <p className="auth-error" id={errId} role="alert">{err}</p>}
      <div className="gld-report-actions">
        <button type="submit" className="auth-submit" disabled={busy}>
          {busy ? t('account.pleaseWait') : t('guides.reportSend')}
        </button>
        <button type="button" className="gld-copy" onClick={close} disabled={busy}>
          {t('guides.reportCancel')}
        </button>
      </div>
    </form>
  );
}
