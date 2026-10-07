import { useEffect, useRef } from 'react';
import { useI18n } from '../../i18n/index.jsx';

// The takedown control, one per guide row (Guides tab) or report card
// (Reports tab). Pure render over useUnpublishGuide. Closed, it is one
// outlined danger button, "Unpublish". Open, it says what happens (private,
// nothing deleted, reports actioned), asks for the reason that goes into
// the audit log, and offers Cancel and the send button. Opening it moves
// focus into the reason field.
//
// Since migration 051 it also asks for the ground (DSA Article 17(3)(d) and
// (e)): illegal content, with the law relied on, or the content rule in the
// Terms of Service, with the item ('c1' to 'c7', titled by the same
// moderation.rule.* keys the owner's statement uses).
//
// `formKey` names where it was opened, so only one form is open on the page.
const RULES = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'];

export function UnpublishGuide({ unpublish, formKey, planId, label }) {
  const { t } = useI18n();
  const {
    armed, reason, setReason, ground, pickGround, groundRef, setGroundRef,
    busy, error, arm, cancel, submit,
  } = unpublish;
  const open = armed === formKey;
  const fieldRef = useRef(null);
  const fieldId = `admin-unpub-${formKey.replace(/[^a-zA-Z0-9-]/g, '-')}`;
  const lawId = `${fieldId}-law`;

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
      <span className="adminpage-lock-label" id={`${fieldId}-ground`}>{t('admin.groundLegend')}</span>
      <div className="adminpage-segment" role="radiogroup" aria-labelledby={`${fieldId}-ground`}>
        {['illegal', 'terms'].map((g) => (
          <button
            key={g}
            type="button"
            role="radio"
            aria-checked={ground === g}
            className={`adminpage-seg ${ground === g ? 'on' : ''}`}
            onClick={() => pickGround(g)}
          >
            {t(g === 'illegal' ? 'admin.groundIllegal' : 'admin.groundTerms')}
          </button>
        ))}
      </div>
      {ground === 'illegal' && (
        <>
          <label className="adminpage-lock-label" htmlFor={lawId}>{t('admin.groundLawLabel')}</label>
          <input
            id={lawId}
            className="adminpage-lock-input"
            maxLength={300}
            value={groundRef}
            placeholder={t('admin.groundLawPlaceholder')}
            onChange={(e) => setGroundRef(e.target.value)}
          />
        </>
      )}
      {ground === 'terms' && (
        <>
          <span className="adminpage-lock-label" id={`${fieldId}-rule`}>{t('admin.groundRuleLabel')}</span>
          <div className="adminpage-segment" role="radiogroup" aria-labelledby={`${fieldId}-rule`}>
            {RULES.map((r, i) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={groundRef === r}
                className={`adminpage-seg ${groundRef === r ? 'on' : ''}`}
                onClick={() => setGroundRef(r)}
              >
                {`${i + 1}. ${t(`moderation.rule.${r}`)}`}
              </button>
            ))}
          </div>
        </>
      )}
      {error && <p className="adminpage-err" role="alert">{error}</p>}
      <div className="adminpage-row">
        <button type="button" className="adminpage-btn" onClick={cancel}>
          {t('admin.unpublishCancel')}
        </button>
        <button
          type="button"
          className="adminpage-btn danger"
          disabled={busy || !reason.trim() || !ground || !groundRef.trim()}
          onClick={() => submit(planId)}
        >
          {busy ? t('account.pleaseWait') : t('admin.unpublishGo')}
        </button>
      </div>
    </div>
  );
}
