import React, { useEffect, useId, useRef, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { AlertIcon, CheckIcon } from '../components/Icons.jsx';

const BODY_MIN = 10;
const BODY_MAX = 4000;
// The items of the content rule in the Terms of Service (TermsOfService.jsx),
// the only values the database accepts as a 'terms' ground (migration 051).
const RULES = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'];

/**
 * ModerationNotice, the statement of reasons shown to the owner of a guide
 * that a moderator took off the public guides (migration 039, DSA Article
 * 17), with the free complaint route (Article 20).
 *
 * WHERE. Under the plan's card in My trips, attached the way the share panel
 * is, because that is where the owner manages who can see the trip and the
 * one place in the app they are sure to see it. There is no email route in
 * the project, so this is the delivery.
 *
 * SHAPE. Closed, one line says what happened and where things stand (taken
 * down, contested, upheld or reversed), with a secondary button to read the
 * statement. Open, the statement is a run of labelled facts divided by
 * hairlines: what we did, why (the moderator's words), what started it, who
 * decided, when, and the options. The complaint form sits under it while a
 * complaint is still possible, with the view's only filled button.
 *
 * The statement is built from fields, not stored prose, so it reads in the
 * owner's language. The only free text is the moderator's reason and answer,
 * and the law a moderator names when the ground is 'illegal'.
 *
 * GROUND (migration 051, DSA Article 17(3)(d) and (e)). A statement written
 * since 051 says whether the guide came down as illegal content (with the
 * law relied on) or under the content rule in the Terms of Service (with the
 * item, whose title is translated here). Older statements carry no ground
 * and the row is left out. LOCK (051): while the decision stands the guide
 * cannot be published again, so the statement says so until it is
 * reversed.
 */
export function ModerationNotice({ statement, contest, onContested }) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const [writing, setWriting] = useState(false);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState(false);
  const bodyRef = useRef(null);
  const uid = useId();
  const panelId = `${uid}-statement`;
  const bodyId = `${uid}-body`;
  const errId = `${uid}-err`;

  useEffect(() => {
    if (writing) bodyRef.current?.focus();
  }, [writing]);

  const s = statement;
  const status = s.complaint_status || 'none';
  const canContest = status === 'none' && !sent && new Date(s.contest_until) > new Date();

  const fmtDate = (iso) => {
    try {
      return new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', year: 'numeric' })
        .format(new Date(iso));
    } catch { return ''; }
  };

  const line = sent || status === 'open' ? t('moderation.lineOpen')
    : status === 'upheld' ? t('moderation.lineUpheld')
      : status === 'reversed' ? t(s.reinstated ? 'moderation.lineReinstated' : 'moderation.lineReversedKept')
        : t('moderation.lineNone');

  const errFor = (code) => {
    if (code === 'bad_reason') return t('moderation.errShort');
    if (code === 'already_contested') return t('moderation.errAlready');
    if (code === 'too_late') return t('moderation.errLate');
    return t('moderation.errGeneric');
  };

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const text = body.trim();
    if (text.length < BODY_MIN) { setErr(errFor('bad_reason')); bodyRef.current?.focus(); return; }
    setBusy(true);
    setErr('');
    try {
      await contest(s.id, text);
      setSent(true);
      setWriting(false);
      setBody('');
      onContested?.(s.id);
    } catch (x) {
      setErr(errFor(x?.code));
    }
    setBusy(false);
  };

  const ground = s.ground === 'terms' && RULES.includes(s.ground_ref)
    ? t('moderation.groundTerms', { rule: t(`moderation.rule.${s.ground_ref}`) })
    : s.ground === 'illegal' && s.ground_ref
      ? t('moderation.groundLaw', { law: s.ground_ref })
      : '';

  const n = Number(s.notice_count) || 0;
  const source = s.source === 'notice'
    ? t(n === 1 ? 'moderation.startNotice1' : 'moderation.startNoticeN', { n })
    : t('moderation.startOwn');

  return (
    <section className="modnote" aria-labelledby={`${uid}-title`}>
      <div className="modnote-head">
        {status === 'reversed' ? <CheckIcon size={15} /> : <AlertIcon size={15} />}
        <h3 className="modnote-title" id={`${uid}-title`}>
          {t(status === 'reversed' ? 'moderation.titleReversed' : 'moderation.title')}
        </h3>
        <span className="modnote-date">{fmtDate(s.created_at)}</span>
      </div>
      <p className="modnote-line" role={sent ? 'status' : undefined}>
        {sent ? t('moderation.contestSent') : line}
      </p>
      <button
        type="button"
        className="gld-copy modnote-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        {t(open ? 'moderation.hideWhy' : 'moderation.readWhy')}
      </button>

      {open && (
        <div id={panelId} className="modnote-body">
          <dl className="modnote-facts">
            <div>
              <dt>{t('moderation.whatLabel')}</dt>
              <dd>{t('moderation.what', { label: s.plan_label || t('saved.fallbackTrip') })}</dd>
            </div>
            <div>
              <dt>{t('moderation.whyLabel')}</dt>
              <dd className="modnote-quote">{s.facts}</dd>
            </div>
            {ground && (
              <div>
                <dt>{t('moderation.groundLabel')}</dt>
                <dd>{ground}</dd>
              </div>
            )}
            <div>
              <dt>{t('moderation.startLabel')}</dt>
              <dd>{source}</dd>
            </div>
            <div>
              <dt>{t('moderation.whoLabel')}</dt>
              <dd>{t(s.automated ? 'moderation.whoAuto' : 'moderation.whoPerson')}</dd>
            </div>
            <div>
              <dt>{t('moderation.whenLabel')}</dt>
              <dd><span className="modnote-date">{fmtDate(s.created_at)}</span></dd>
            </div>
            {status !== 'reversed' && (
              <div>
                <dt>{t('moderation.lockLabel')}</dt>
                <dd>{t('moderation.lock')}</dd>
              </div>
            )}
            {s.complaint_note && (status === 'upheld' || status === 'reversed') && (
              <div>
                <dt>{t('moderation.answerLabel')}</dt>
                <dd className="modnote-quote">{s.complaint_note}</dd>
              </div>
            )}
            <div>
              <dt>{t('moderation.optionsLabel')}</dt>
              <dd>
                {canContest
                  ? t('moderation.options', { date: fmtDate(s.contest_until) })
                  : t('moderation.optionsClosed')}
              </dd>
            </div>
          </dl>

          {canContest && !writing && (
            <button type="button" className="gld-copy modnote-toggle" onClick={() => setWriting(true)}>
              {t('moderation.contestOpen')}
            </button>
          )}

          {canContest && writing && (
            <form className="modnote-form" onSubmit={submit} noValidate>
              <div className="auth-field">
                <label className="auth-label" htmlFor={bodyId}>{t('moderation.contestLabel')}</label>
                <textarea
                  ref={bodyRef}
                  id={bodyId}
                  className="account-feedback-input"
                  rows={5}
                  maxLength={BODY_MAX}
                  required
                  aria-invalid={err === errFor('bad_reason') ? 'true' : undefined}
                  aria-describedby={err ? errId : undefined}
                  value={body}
                  onChange={(e) => { setBody(e.target.value); setErr(''); }}
                  placeholder={t('moderation.contestPlaceholder')}
                />
              </div>
              {err && <p className="auth-error" id={errId} role="alert">{err}</p>}
              <div className="modnote-actions">
                <button type="submit" className="auth-submit" disabled={busy}>
                  {busy ? t('account.pleaseWait') : t('moderation.contestSend')}
                </button>
                <button
                  type="button"
                  className="gld-copy"
                  disabled={busy}
                  onClick={() => { setWriting(false); setErr(''); }}
                >
                  {t('moderation.contestCancel')}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
