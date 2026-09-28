import { useEffect, useRef } from 'react';
import { useI18n } from '../../i18n/index.jsx';

// One reasoned decision in the Reports tab (migration 039): dismiss a
// report, uphold a complaint, or reverse one. Pure render over
// useModerationDecision. Closed, it is one outlined button. Open, it says
// what will happen, asks for the reason with a label tied to the field, and
// offers Cancel and the send button, which stays disabled until the reason
// has text. Same flow as UnpublishGuide, so every moderation action on the
// page behaves alike.
//
// `kind` is dismiss, upheld or reversed; `id` is the report or statement
// id; `copy` holds the keys for this kind's words.
export function DecisionForm({ decision, kind, id, copy, danger = false, ariaLabel }) {
  const { t } = useI18n();
  const { armed, reason, setReason, busy, error, arm, cancel, submit } = decision;
  const formKey = `${kind}:${id}`;
  const open = armed === formKey;
  const fieldRef = useRef(null);
  const fieldId = `admin-decide-${kind}-${id}`;
  const btn = `adminpage-btn${danger ? ' danger' : ''}`;

  useEffect(() => {
    if (open) fieldRef.current?.focus();
  }, [open]);

  if (!open) {
    return (
      <button type="button" className={btn} onClick={() => arm(formKey)} aria-label={ariaLabel}>
        {t(copy.arm)}
      </button>
    );
  }

  return (
    <div className="adminpage-armed">
      <p className="adminpage-muted">{t(copy.hint)}</p>
      <label className="adminpage-lock-label" htmlFor={fieldId}>{t(copy.label)}</label>
      <textarea
        id={fieldId}
        ref={fieldRef}
        className="adminpage-textarea"
        rows={3}
        maxLength={2000}
        value={reason}
        placeholder={t(copy.placeholder)}
        onChange={(e) => setReason(e.target.value)}
      />
      {error && <p className="adminpage-err" role="alert">{error}</p>}
      <div className="adminpage-row">
        <button type="button" className="adminpage-btn" onClick={cancel}>
          {t('admin.decisionCancel')}
        </button>
        <button
          type="button"
          className={btn}
          disabled={busy || !reason.trim()}
          onClick={() => submit(kind, id)}
        >
          {busy ? t('account.pleaseWait') : t(copy.go)}
        </button>
      </div>
    </div>
  );
}
