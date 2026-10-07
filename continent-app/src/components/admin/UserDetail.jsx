import { TIERS } from '../../lib/pricing.js';
import { useI18n } from '../../i18n/index.jsx';
import { ArrowLeftIcon } from '../Icons.jsx';
import { fmtDate, fmtDateTime, initial, rowName } from './format.js';
import { MfaStepUp } from './MfaStepUp.jsx';
import { useMfa } from './useMfa.js';

// One account in full: facts, history, pass, support actions, notes, and
// deletion. A render over useUserDetail, plus the MFA step-up that ban and
// delete need (migration 032 refuses both below aal2) and, since migration
// 051 (owner decision T063-e), a pass change too.
export function UserDetail({ account }) {
  const { t } = useI18n();
  const mfa = useMfa();
  const {
    detail, setDetail, detailBusy,
    tierPick, setTierPick, tierDays, setTierDays, tierBusy, applyTier,
    actionNotice, actionErr,
    quotaArmed, quotaBusy, resetQuota, resetBusy, sendReset,
    banArmed, setBanArmed, banDays, setBanDays, banBusy, doBan, doUnban,
    noteText, setNoteText, noteBusy, saveNote,
    deleteArmed, setDeleteArmed, deleteConfirm, setDeleteConfirm, deleteBusy, doDelete,
  } = account;
  return (
    <div className="adminpage-detail">
      <button type="button" className="adminpage-back" onClick={() => setDetail(null)}>
        <ArrowLeftIcon size={13} /> {t('admin.backToList')}
      </button>

      <div className="adminpage-detail-head">
        <span className="adminpage-ava lg" aria-hidden="true">
          {detail.avatarEmoji || initial(detail)}
        </span>
        <div className="adminpage-detail-id">
          <h2>{rowName(detail)}</h2>
          <p>
            {detail.email}
            {detail.handle ? ` @${detail.handle}` : ''}
          </p>
          <code className="adminpage-uuid">{detail.id}</code>
        </div>
        <div className="adminpage-detail-chips">
          {detail.isAdmin && <span className="adminpage-chip staff">{t('admin.chipStaff')}</span>}
          {!!detail.bannedUntil && <span className="adminpage-chip banned">{t('admin.chipBanned')}</span>}
          {detail.tier !== 'free' && <span className={`adminpage-chip ${detail.tier}`}>{detail.tier}</span>}
        </div>
      </div>

      {actionNotice && <p className="adminpage-ok">{actionNotice}</p>}
      {actionErr && <p className="adminpage-err">{actionErr}</p>}

      <div className="adminpage-cols">
        <section className="adminpage-card">
          <h3 className="adminpage-h3">{t('admin.factsTitle')}</h3>
          <dl className="adminpage-facts">
            <div><dt>{t('admin.fSignedUp')}</dt><dd>{fmtDate(detail.createdAt)}</dd></div>
            <div><dt>{t('admin.fLastSeen')}</dt><dd>{fmtDateTime(detail.lastSignIn) || t('admin.never')}</dd></div>
            <div><dt>{t('admin.fProvider')}</dt><dd>{detail.provider || 'email'}</dd></div>
            <div><dt>{t('admin.fConfirmed')}</dt><dd>{detail.confirmedAt ? t('admin.yes') : t('admin.no')}</dd></div>
            {!!detail.bannedUntil && (
              <div><dt>{t('admin.fBanned')}</dt><dd>{fmtDate(detail.bannedUntil)}</dd></div>
            )}
            <div><dt>{t('admin.fTrips')}</dt><dd>{detail.tripPlans}</dd></div>
            <div><dt>{t('admin.fDayPlans')}</dt><dd>{detail.dayPlans}</dd></div>
            <div><dt>{t('admin.fFriends')}</dt><dd>{detail.friends}</dd></div>
            <div><dt>{t('admin.fBadges')}</dt><dd>{(detail.badges || []).length}</dd></div>
            <div><dt>{t('admin.fPlansUsed')}</dt><dd>{detail.plansUsed}</dd></div>
            <div><dt>{t('admin.fGroundUsed')}</dt><dd>{detail.groundUsed}</dd></div>
          </dl>

          <h3 className="adminpage-h3">{t('admin.historyTitle')}</h3>
          {(detail.history || []).length === 0 ? (
            <p className="adminpage-muted">{t('admin.historyEmpty')}</p>
          ) : (
            <ul className="adminpage-log">
              {detail.history.map((h, i) => (
                <li key={i}>
                  <span className="adminpage-when">{fmtDateTime(h.createdAt)}</span>
                  <span className="adminpage-what">
                    <b>{h.action}</b>
                    {h.action === 'note' && h.detail?.text ? ` ${h.detail.text}`
                      : h.detail?.tier ? ` ${h.detail.tier}`
                      : h.detail?.days ? ` ${h.detail.days}d` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="adminpage-card">
          <h3 className="adminpage-h3">{t('admin.passTitle')}</h3>
          {detail.tier !== 'free' && detail.expiresAt && (
            <p className="adminpage-muted">
              {t('admin.passUntil', {
                tier: t((TIERS[detail.tier] || TIERS.free).labelKey),
                date: fmtDate(detail.expiresAt),
              })}
            </p>
          )}
          <div className="adminpage-segment" role="radiogroup" aria-label={t('admin.passTitle')}>
            {['free', 'trip', 'year'].map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={tierPick === k}
                className={`adminpage-seg ${tierPick === k ? 'on' : ''}`}
                onClick={() => setTierPick(k)}
              >
                {t(TIERS[k].labelKey)}
              </button>
            ))}
          </div>
          {tierPick !== 'free' && (
            <div className="adminpage-inline">
              <label htmlFor="admin-days">{t('admin.passDays')}</label>
              <input
                id="admin-days"
                inputMode="numeric"
                placeholder={tierPick === 'year' ? '365' : '30'}
                value={tierDays}
                onChange={(e) => setTierDays(e.target.value.replace(/[^0-9]/g, ''))}
              />
            </div>
          )}
          <MfaStepUp mfa={mfa} idPrefix="admin-tier" />
          <button
            type="button"
            className="adminpage-btn primary wide"
            disabled={tierBusy || detailBusy || !mfa.stepped}
            onClick={applyTier}
          >
            {tierBusy ? t('account.pleaseWait') : t('admin.passApply')}
          </button>

          <h3 className="adminpage-h3">{t('admin.supportTitle')}</h3>
          <div className="adminpage-stack">
            <button type="button" className="adminpage-btn" disabled={quotaBusy} onClick={resetQuota}>
              {quotaBusy ? t('account.pleaseWait') : quotaArmed ? t('admin.quotaConfirm') : t('admin.quotaReset')}
            </button>
            <button type="button" className="adminpage-btn" disabled={resetBusy || !detail.email} onClick={sendReset}>
              {resetBusy ? t('account.pleaseWait') : t('admin.sendReset')}
            </button>
            {!detail.bannedUntil ? (
              !banArmed ? (
                <button type="button" className="adminpage-btn" onClick={() => setBanArmed(true)}>
                  {t('admin.banArm')}
                </button>
              ) : (
                <div className="adminpage-armed">
                  <p className="adminpage-muted">{t('admin.banHint')}</p>
                  <div className="adminpage-inline">
                    <label htmlFor="admin-ban-days">{t('admin.passDays')}</label>
                    <input
                      id="admin-ban-days"
                      inputMode="numeric"
                      placeholder="36500"
                      value={banDays}
                      onChange={(e) => setBanDays(e.target.value.replace(/[^0-9]/g, ''))}
                    />
                  </div>
                  <MfaStepUp mfa={mfa} idPrefix="admin-ban" />
                  <div className="adminpage-row">
                    <button type="button" className="adminpage-btn" onClick={() => { setBanArmed(false); setBanDays(''); }}>
                      {t('admin.banCancel')}
                    </button>
                    <button type="button" className="adminpage-btn danger" disabled={banBusy || !mfa.stepped} onClick={doBan}>
                      {banBusy ? t('account.pleaseWait') : t('admin.banGo')}
                    </button>
                  </div>
                </div>
              )
            ) : (
              <button type="button" className="adminpage-btn" disabled={banBusy} onClick={doUnban}>
                {banBusy ? t('account.pleaseWait') : t('admin.banLift')}
              </button>
            )}
          </div>

          <h3 className="adminpage-h3">{t('admin.notesTitle')}</h3>
          <textarea
            className="adminpage-textarea"
            rows={3}
            maxLength={1000}
            value={noteText}
            placeholder={t('admin.notePlaceholder')}
            onChange={(e) => setNoteText(e.target.value)}
          />
          <button
            type="button"
            className="adminpage-btn"
            disabled={noteBusy || !noteText.trim()}
            onClick={saveNote}
          >
            {noteBusy ? t('account.pleaseWait') : t('admin.noteSave')}
          </button>

          <h3 className="adminpage-h3 danger">{t('admin.dangerTitle')}</h3>
          {!deleteArmed ? (
            <button type="button" className="adminpage-btn danger" onClick={() => setDeleteArmed(true)}>
              {t('admin.deleteArm')}
            </button>
          ) : (
            <div className="adminpage-armed">
              <p className="adminpage-muted">{t('admin.deleteHint')}</p>
              <label className="adminpage-lock-label" htmlFor="admin-del-confirm">
                {t('admin.deleteConfirmLabel')}
              </label>
              <input
                id="admin-del-confirm"
                className="adminpage-lock-input"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder={detail.email || detail.handle || ''}
                autoComplete="off"
              />
              <MfaStepUp mfa={mfa} idPrefix="admin-del" />
              <div className="adminpage-row">
                <button
                  type="button"
                  className="adminpage-btn"
                  onClick={() => { setDeleteArmed(false); setDeleteConfirm(''); }}
                >
                  {t('admin.deleteCancel')}
                </button>
                <button
                  type="button"
                  className="adminpage-btn danger solid"
                  disabled={deleteBusy || !deleteConfirm.trim() || !mfa.stepped}
                  onClick={doDelete}
                >
                  {deleteBusy ? t('account.pleaseWait') : t('admin.deleteGo')}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
