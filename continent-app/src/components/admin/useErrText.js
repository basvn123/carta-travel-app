import { useCallback } from 'react';
import { useI18n } from '../../i18n/index.jsx';

// RPC error codes to a sentence on screen. One callback for the whole
// admin page: the user list effect depends on its identity, so it is made
// once in the shell and handed down rather than rebuilt per view.
export function useErrText() {
  const { t } = useI18n();
  const errText = useCallback((e) => {
    const code = e?.code || '';
    // Below aal2, delete and ban refuse. 032 raised 42501 with the hint
    // mfa_required (42501 is every permission error, so the hint is the word
    // to branch on); 045 returns {error: 'mfa_required'} instead, so the
    // refusal can leave an audit row. Both shapes read the same.
    if (e?.hint === 'mfa_required' || code === 'mfa_required') return t('admin.errMfa');
    if (code === 'forbidden') return t('admin.errForbidden');
    if (code === 'slow_down') return t('admin.errSlow');
    if (code === 'confirm_mismatch') return t('admin.errConfirm');
    if (code === 'target_is_admin') return t('admin.errTargetAdmin');
    if (code === 'own_account') return t('admin.errOwn');
    if (code === 'bad_note') return t('admin.errNote');
    if (code === 'bad_reason') return t('admin.errReason');
    // not_found is not mapped here: admin_get_user answers it for a deleted
    // account too, so the takedown hook words its own (useUnpublishGuide).
    // A Postgres error carries its own message, and on this screen the person
    // reading it is the person who can fix it, so it is shown rather than
    // flattened into "something went wrong".
    if (e?.message) return e.message;
    return t('admin.errGeneric');
  }, [t]);
  return errText;
}
