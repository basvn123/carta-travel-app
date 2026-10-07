import React, { useId, useRef, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { SheetShell } from '../browse/SheetShell.jsx';
import { CheckIcon } from './Icons.jsx';
import { REPORT_WHATS, sendReport } from '../lib/feedback.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@.]+$/;

/**
 * ReportProblem, the front door of the feedback loop (T326,
 * docs/FEEDBACK-LOOP.md option A).
 *
 * A quiet text link on an item page, or beside a price. It opens the
 * feedback form as a sheet over the page, so the traveller keeps their
 * place, prefilled with the item. The sheet names what the report is about,
 * asks what is wrong as radio rows, takes a sentence and sends it with a
 * report key in the context block, so the admin inbox knows which item.
 *
 * item: { layer, id, cc, name }. layer is the override console's key
 * (beach, lake, mountain, trail, cycle, dest) or trip for a journey page.
 * priceOnly: the link reads Report this price and the choice starts on
 * price. The link is a secondary action, never a primary button, never red.
 */
export function ReportProblem({ item, priceOnly = false, className = '' }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [what, setWhat] = useState(priceOnly ? 'price' : 'photo');
  const [text, setText] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState(false);
  const id = useId();
  const btnRef = useRef(null);
  if (!item || item.id === undefined || item.id === null || item.id === '') return null;

  const close = () => {
    setOpen(false);
    setErr('');
    if (sent) { setSent(false); setText(''); }
  };
  const kindWord = t(`report.layer.${item.layer}`);
  const submit = async (e) => {
    e.preventDefault();
    if (busy || !text.trim()) return;
    const m = email.trim();
    if (m && (m.length > 254 || !EMAIL_RE.test(m))) { setErr(t('report.errGeneric')); return; }
    setBusy(true);
    setErr('');
    try {
      await sendReport({ item, what, message: text.trim(), email: m || null });
      setSent(true);
    } catch (x) {
      setErr(x?.code === 'too_many' ? t('report.errTooMany') : t('report.errGeneric'));
    }
    setBusy(false);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`report-link ${priceOnly ? 'is-price' : ''} ${className}`}
        onClick={() => { setWhat(priceOnly ? 'price' : 'photo'); setOpen(true); }}
        aria-haspopup="dialog"
        data-testid="report-open"
      >
        {t(priceOnly ? 'report.openPrice' : 'report.open')}
      </button>
      {open && (
        <SheetShell
          title={t('report.title')}
          onClose={close}
          anchorRef={btnRef}
          labelId={`${id}-title`}
          closeLabel={t('report.close')}
          className="report-sheet"
        >
          {sent ? (
            <div className="report-done" role="status">
              <CheckIcon size={16} />
              <p>{t('report.sent')}</p>
            </div>
          ) : (
            <form className="report-form" onSubmit={submit} noValidate>
              <p className="report-about">{t('report.about', { name: item.name || String(item.id), kind: kindWord })}</p>
              <div role="radiogroup" aria-label={t('report.whatLabel')} className="report-whats">
                <span className="report-label">{t('report.whatLabel')}</span>
                {REPORT_WHATS.map((w) => (
                  <label key={w} className={`report-what ${what === w ? 'on' : ''}`}>
                    <input type="radio" name={`${id}-what`} value={w} checked={what === w} onChange={() => setWhat(w)} />
                    <span>{t(`report.what.${w}`)}</span>
                  </label>
                ))}
              </div>
              <label className="report-label" htmlFor={`${id}-msg`}>{t('report.messageLabel')}</label>
              <textarea
                id={`${id}-msg`}
                className="report-input"
                rows={4}
                maxLength={2000}
                value={text}
                onChange={(e) => { setText(e.target.value); setErr(''); }}
                placeholder={t('report.placeholder')}
              />
              <label className="report-label" htmlFor={`${id}-mail`}>{t('report.emailLabel')}</label>
              <input
                id={`${id}-mail`}
                className="report-input report-mail"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setErr(''); }}
                aria-describedby={`${id}-note`}
              />
              <p className="report-note" id={`${id}-note`}>{t('report.emailNote')}</p>
              {err && <p className="report-err" role="alert">{err}</p>}
              <button type="submit" className="report-send" disabled={busy || !text.trim()}>
                {t('report.send')}
              </button>
            </form>
          )}
        </SheetShell>
      )}
    </>
  );
}

export default ReportProblem;
