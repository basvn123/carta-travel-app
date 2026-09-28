import { useState } from 'react';
import { useAuth } from '../../auth/AuthContext.jsx';
import { useI18n } from '../../i18n/index.jsx';
import { LockIcon } from '../Icons.jsx';

// The re-auth lock in front of the admin page. A second pair of eyes on a
// warm session, not a gate: the gate is admin_guard in the database. Its
// state only exists while the page is locked, so it lives here and the
// shell only learns the outcome through onUnlock.
export function AdminLock({ onUnlock, onClose }) {
  const { t } = useI18n();
  const { user, hasPassword, reauthenticate } = useAuth();

  const [lockValue, setLockValue] = useState('');
  const [lockBusy, setLockBusy] = useState(false);
  const [lockErr, setLockErr] = useState('');

  const unlock = async () => {
    setLockBusy(true); setLockErr('');
    try {
      if (hasPassword) {
        await reauthenticate(lockValue);
      } else if (lockValue.trim().toLowerCase() !== (user?.email || '').toLowerCase()) {
        throw new Error('mismatch');
      }
      onUnlock();
    } catch {
      setLockErr(hasPassword ? t('admin.lockWrong') : t('admin.lockWrongEmail'));
    }
    setLockBusy(false);
  };

  return (
    <div className="adminpage adminpage-locked">
      <div className="adminpage-lock">
        <span className="adminpage-lock-icon" aria-hidden="true"><LockIcon size={22} /></span>
        <h1 className="adminpage-lock-title">{t('admin.title')}</h1>
        <p className="adminpage-lock-hint">
          {hasPassword ? t('admin.lockHint') : t('admin.lockHintEmail')}
        </p>
        <label className="adminpage-lock-label" htmlFor="admin-lock-input">
          {hasPassword ? t('admin.lockLabel') : t('admin.lockLabelEmail')}
        </label>
        <input
          id="admin-lock-input"
          className="adminpage-lock-input"
          type={hasPassword ? 'password' : 'email'}
          autoComplete={hasPassword ? 'current-password' : 'off'}
          value={lockValue}
          onChange={(e) => { setLockValue(e.target.value); setLockErr(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && lockValue.trim()) unlock(); }}
        />
        {lockErr && <p className="adminpage-err">{lockErr}</p>}
        <div className="adminpage-lock-actions">
          <button type="button" className="adminpage-btn" onClick={onClose}>
            {t('admin.lockCancel')}
          </button>
          <button
            type="button"
            className="adminpage-btn primary"
            disabled={lockBusy || !lockValue.trim()}
            onClick={unlock}
          >
            {lockBusy ? t('account.pleaseWait') : t('admin.lockUnlock')}
          </button>
        </div>
      </div>
    </div>
  );
}
