import { useI18n } from '../../i18n/index.jsx';

// The step-up box inside an armed ban or delete. Renders nothing once the
// session is aal2. Without a verified factor it enrols one first: the QR
// code and the secret, then the first code, which both verifies the factor
// and steps the session up in one go.
export function MfaStepUp({ mfa, idPrefix }) {
  const { t } = useI18n();
  if (mfa.stepped || mfa.level === null) return null;

  const enrolling = !!mfa.enrolment;
  const needsFactor = !mfa.factorId && !enrolling;
  const inputId = `${idPrefix}-mfa-code`;

  return (
    <div className="adminpage-mfa">
      <p className="adminpage-muted">
        {needsFactor ? t('admin.mfaNeedFactor') : enrolling ? t('admin.mfaScan') : t('admin.mfaStepUp')}
      </p>

      {needsFactor ? (
        <button type="button" className="adminpage-btn" disabled={mfa.busy} onClick={mfa.startEnrol}>
          {mfa.busy ? t('account.pleaseWait') : t('admin.mfaEnrol')}
        </button>
      ) : (
        <>
          {enrolling && (
            <div className="adminpage-mfa-enrol">
              <img className="adminpage-mfa-qr" src={mfa.enrolment.qr} alt={t('admin.mfaQrAlt')} width="168" height="168" />
              <p className="adminpage-muted">{t('admin.mfaSecret')}</p>
              <code className="adminpage-mfa-secret">{mfa.enrolment.secret}</code>
            </div>
          )}
          <label className="adminpage-lock-label" htmlFor={inputId}>{t('admin.mfaCodeLabel')}</label>
          <div className="adminpage-row">
            <input
              id={inputId}
              className="adminpage-lock-input mono adminpage-mfa-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              value={mfa.code}
              onChange={(e) => mfa.setCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') mfa.verify(); }}
            />
            <button
              type="button"
              className="adminpage-btn"
              disabled={mfa.busy || mfa.code.length !== 6}
              onClick={mfa.verify}
            >
              {mfa.busy ? t('account.pleaseWait') : t('admin.mfaVerify')}
            </button>
          </div>
        </>
      )}

      {mfa.err?.kind === 'code' && <p className="adminpage-err">{t('admin.mfaWrongCode')}</p>}
      {mfa.err?.kind === 'enrol' && (
        <p className="adminpage-err">
          {t('admin.mfaEnrolFailed')}{mfa.err.message ? ` (${mfa.err.message})` : ''}
        </p>
      )}
    </div>
  );
}
