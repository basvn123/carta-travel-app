import React, { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button, Chip, ChipGroup, Field } from '../../components/ui/index.js';
import { sendFeedback } from '../../lib/feedback.js';

/**
 * Send feedback (T461): what kind of message, the message, Send. It goes to
 * the database the admin inbox reads (submit_feedback). There is no address
 * on screen and no mail fallback (owner, 2026-10-16): a message that cannot be
 * sent says so in one line, and what was typed stays in the field.
 *
 * One status line stays mounted through every state, so a screen reader hears
 * "Sent" and a failure, and focus moves to whatever replaced the control the
 * traveller pressed (Send another after a send, the message after it).
 */
const KINDS = ['bug', 'idea', 'other'];

export function FeedbackView() {
  const { t } = useI18n();
  const [kind, setKind] = useState('other');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');
  const againRef = useRef(null);
  const moved = useRef(false);

  useEffect(() => {
    if (!moved.current) return;
    if (sent) againRef.current?.focus();
    else document.getElementById('acct-feedback')?.focus();
  }, [sent]);

  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setErr('');
    try {
      await sendFeedback({ message: text.trim(), kind });
      moved.current = true;
      setSent(true);
      setText('');
    } catch (e) {
      setErr(t(e?.code === 'too_many' ? 'account.feedbackTooMany' : 'account.feedbackFailed'));
    }
    setBusy(false);
  };

  return (
    <div className="panel-section acct-feedback">
      <p className={sent ? 'acct-status' : 'acct-error'} role="status" aria-live="polite">
        {sent ? t('account.feedbackThanks') : err}
      </p>
      {sent ? (
        <div>
          <Button ref={againRef} onClick={() => setSent(false)}>{t('account.feedbackAgain')}</Button>
        </div>
      ) : (
        <>
          <ChipGroup label={t('account.feedbackKind')} className="acct-chips">
            {KINDS.map((k) => (
              <Chip key={k} kind="choice" selected={kind === k} onClick={() => setKind(k)}>
                {t(`account.feedbackKind.${k}`)}
              </Chip>
            ))}
          </ChipGroup>
          <Field
            as="textarea"
            id="acct-feedback"
            label={t('account.feedbackLabel')}
            rows={6}
            maxLength={4000}
            value={text}
            placeholder={t('account.feedbackPlaceholder')}
            aria-invalid={err ? true : undefined}
            onChange={(e) => { setText(e.target.value); setErr(''); }}
          />
          <div>
            <Button variant="primary" onClick={send} loading={busy} disabled={!text.trim()}>
              {t('account.feedbackSend')}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
