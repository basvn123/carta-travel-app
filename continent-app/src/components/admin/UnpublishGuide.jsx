import { useEffect, useRef } from 'react';
import { useI18n } from '../../i18n/index.jsx';

// The takedown control, one per guide row (Guides tab) or report card
// (Reports tab). Pure render over useUnpublishGuide. Closed, it is one
// outlined danger button, "Unpublish". Open, it says what happens (private,
// nothing deleted, reports actioned), asks for the reason that goes into
// the audit log, and offers Cancel and the send button. Opening it moves
// focus into the reason field.
//
// `formKey` names where it was opened, so only one form is open on the page.
export function UnpublishGuide({ unpublish, formKey, planId, label }) {
  const { t } = useI18n();
  const { armed, reason, setReason, busy, error, arm, cancel, submit } = unpublish;
  const open = armed === formKey;
  const fieldRef = useRef(null);
  const fieldId = `admin-unpub-${formKey.replace(/[^a-zA-Z0-9-]/g, '-')}`;

  useEffect(() => {
    if (open) fieldRef.current?.focus();
  }, [open]);

  if (!open) {
    return (
      <button
        type="button"
        className="adminpage-btn danger"
        onClick={() => arm(formKey)}
        aria-label={label ? t('admin.unpublishArmFor', { label }) : undefined}
      >
        {t('admin.unpublishArm')}
      </button>
    );
  }

  return (
    <div className="adminpage-armed">
      <p className="adminpage-muted">{t('admin.unpublishHint')}</p>
      <label className="adminpage-lock-label" htmlFor={fieldId}>
        {t('admin.unpublishReasonLabel')}
      </label>
      <textarea
        id={fieldId}
        ref={fieldRef}
        className="adminpage-textarea"
        rows={3}
        maxLength={2000}
        value={reason}
        placeholder={t('admin.unpublishReasonPlaceholder')}
        onChange={(e) => setReason(e.target.value)}
      />
      {error && <p className="adminpage-err" role="alert">{error}</p>}
      <div className="adminpage-row">
        <button type="button" className="adminpage-btn" onClick={cancel}>
          {t('admin.unpublishCancel')}
        </button>
        <button
          type="button"
          className="adminpage-btn danger"
          disabled={busy || !reason.trim()}
          onClick={() => submit(planId)}
        >
          {busy ? t('account.pleaseWait') : t('admin.unpublishGo')}
        </button>
      </div>
    </div>
  );
}
