import React from 'react';
import { useI18n } from '../i18n/index.jsx';
import { Button, Chip, ChipGroup } from './ui/index.js';
import { SparkIcon } from './Icons.jsx';
import { SUPPORT_EMAIL } from '../lib/contact.js';
import { REASONS, LIMITS, sendAiReport } from '../lib/aiReport.js';
import '../styles/95-ai-mark.css';

/**
 * The "written by AI" line (T1215, rows T1156-c and T1156-d, ROADMAP F8).
 * One small line under every text a model wrote: Ask Carta's written
 * sentences, a day plan's summary and its stops' reasons, and the town
 * suggestions. The EU AI Act transparency duty (Article 50) is that a
 * traveller knows the text was written by a model; the "How Carta uses AI"
 * page (/?legal=ai, a new tab so the chat or plan is kept) says which model
 * and how it is checked.
 *
 *   report   optional { feature, question, answer, model }: adds the
 *            "Report" button (AiReport below) on the same line.
 */
export function AiMark({ report = null, className = '' }) {
  const { t } = useI18n();
  return (
    <div className={`ai-mark${className ? ` ${className}` : ''}`}>
      <p className="ai-mark-line">
        <SparkIcon size={14} className="ai-mark-icon" />
        <span>{t('aiMark.label')}</span>
        <a className="ai-mark-link" href="?legal=ai" target="_blank" rel="noopener noreferrer">
          {t('aiMark.how')}
          <span className="sr-only"> {t('aiMark.newTab')}</span>
        </a>
      </p>
      {report && <AiReport {...report} />}
    </div>
  );
}

/**
 * "Report": a reason, an optional note, Send. Sends what was asked and
 * what was shown (lib/aiReport.js, migration 074), never an account id.
 * Before 074 is live, or when sending fails, it offers the mail instead.
 */
export function AiReport({ feature, question = '', answer = '', model = null }) {
  const { t, lang } = useI18n();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState(null);
  const [note, setNote] = React.useState('');
  const [state, setState] = React.useState('idle'); // idle | sending | sent | not_live | too_many | error
  const id = React.useId();

  if (state === 'sent') {
    return <p className="ai-report-done" role="status">{t('aiReport.sent')}</p>;
  }
  if (!open) {
    return (
      <Button variant="quiet" size="sm" className="ai-report-btn" onClick={() => setOpen(true)} aria-expanded="false">
        {t('aiReport.button')}
      </Button>
    );
  }
  const send = async () => {
    if (!reason || state === 'sending') return;
    setState('sending');
    const r = await sendAiReport({ feature, reason, question, answer, lang, model, note });
    setState(r.ok ? 'sent' : r.code === 'too_many' ? 'too_many' : r.code === 'not_live' ? 'not_live' : 'error');
  };
  const mail = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(t('aiPage.mailSubject'))}`
    + `&body=${encodeURIComponent(`${question}\n\n${answer}`.slice(0, 1500))}`;
  return (
    <form className="ai-report" aria-labelledby={`${id}-h`} onSubmit={(e) => { e.preventDefault(); send(); }}>
      <p className="ai-report-h" id={`${id}-h`}>{t('aiReport.title')}</p>
      <ChipGroup label={t('aiReport.reasonLabel')} className="ai-report-reasons">
        {REASONS.map((r, i) => (
          // With no reason picked yet, the first chip takes the tab stop.
          <Chip key={r} kind="choice" selected={reason === r} onClick={() => setReason(r)}
            {...(reason == null && i === 0 ? { tabIndex: 0 } : {})}>
            {t(`aiReport.reason.${r}`)}
          </Chip>
        ))}
      </ChipGroup>
      <label className="ai-report-note-label" htmlFor={`${id}-note`}>{t('aiReport.noteLabel')}</label>
      <textarea id={`${id}-note`} className="ai-report-note" rows={2} maxLength={LIMITS.note}
        value={note} onChange={(e) => setNote(e.target.value)} />
      <p className="ai-report-what">{t('aiReport.what')}</p>
      {(state === 'not_live' || state === 'error') && (
        <p className="ai-report-fail" role="alert">
          {t('aiReport.failed')} <a href={mail}>{t('aiReport.mail')}</a>
        </p>
      )}
      {state === 'too_many' && <p className="ai-report-fail" role="alert">{t('aiReport.tooMany')}</p>}
      <div className="ai-report-actions">
        <Button type="submit" variant="secondary" size="sm" className="ai-report-btn" disabled={!reason} loading={state === 'sending'}>
          {t('aiReport.send')}
        </Button>
        <Button variant="quiet" size="sm" className="ai-report-btn" onClick={() => { setOpen(false); setState('idle'); }}>
          {t('aiReport.cancel')}
        </Button>
      </div>
    </form>
  );
}

export default AiMark;
