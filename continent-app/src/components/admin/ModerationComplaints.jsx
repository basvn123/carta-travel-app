import { useI18n } from '../../i18n/index.jsx';
import { fmtDateTime } from './format.js';
import { DecisionForm } from './DecisionForm.jsx';

const UPHOLD = {
  arm: 'admin.upholdArm', hint: 'admin.upholdHint', label: 'admin.answerLabel',
  placeholder: 'admin.upholdPlaceholder', go: 'admin.upholdGo',
};
const REVERSE = {
  arm: 'admin.reverseArm', hint: 'admin.reverseHint', label: 'admin.answerLabel',
  placeholder: 'admin.reversePlaceholder', go: 'admin.reverseGo',
};

// Complaints against takedowns, at the top of the Reports tab (migration
// 039, DSA Article 20). Pure render over useModerationComplaints and
// useModerationDecision.
//
// WHY IN THE REPORTS TAB AND NOT A TAB OF ITS OWN. A complaint is the last
// step of the same case a report starts: report, takedown, statement,
// complaint, answer. A moderator deciding one wants the notices beside it,
// and the queue is small. It sits above the notices because an owner who
// contested a decision is waiting on an answer about their own trip.
//
// Each card shows the guide, the owner, the reason the guide came down, the
// owner's complaint, and whether reversing would put it back in the gallery
// (the reinstate rule in 039: only if the plan is still private and nothing
// a reader sees has changed). Uphold and Reverse each ask for the answer
// the owner will read.
export function ModerationComplaints({ list, decision, onOpenUser }) {
  const { t } = useI18n();
  const { complaints, filter, choose, busy, error, reload } = list;
  const rows = complaints?.rows || [];

  const formFor = (r, kind) => (
    <DecisionForm
      decision={decision}
      kind={kind}
      id={r.statementId}
      copy={kind === 'upheld' ? UPHOLD : REVERSE}
      ariaLabel={t(kind === 'upheld' ? 'admin.upholdArmFor' : 'admin.reverseArmFor',
        { label: r.planLabel || t('admin.guidesUntitled') })}
    />
  );
  const openKind = (r) => ['upheld', 'reversed'].find((k) => decision.armed === `${k}:${r.statementId}`);

  return (
    <section aria-labelledby="admin-complaints-h">
      <h2 className="adminpage-h2" id="admin-complaints-h">{t('admin.complaintsTitle')}</h2>
      <p className="adminpage-muted">{t('admin.complaintsHint')}</p>
      <div className="adminpage-segment" role="radiogroup" aria-label={t('admin.complaintsTitle')}>
        {['open', 'all'].map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={filter === s}
            className={`adminpage-seg ${filter === s ? 'on' : ''}`}
            onClick={() => choose(s)}
          >
            {t(`admin.complaints.${s}`)}
            {s === 'open' && complaints?.open ? ` (${complaints.open})` : ''}
          </button>
        ))}
      </div>

      {error && (
        <p className="adminpage-err">
          {error}
          <button type="button" className="adminpage-retry" onClick={reload}>{t('admin.retry')}</button>
        </p>
      )}
      {!error && !busy && complaints && rows.length === 0 && (
        <p className="adminpage-muted">{t('admin.complaintsEmpty')}</p>
      )}

      {!error && rows.length > 0 && (
        <div className="adminpage-fblist">
          {rows.map((r) => {
            const open = openKind(r);
            return (
              <article key={r.statementId} className="adminpage-fb">
                <header className="adminpage-fbhead">
                  <span className={`adminpage-chip status-${r.complaintStatus === 'open' ? 'new' : r.complaintStatus}`}>
                    {t(`admin.complaints.${r.complaintStatus}`)}
                  </span>
                  <b>{r.planLabel || t('admin.guidesUntitled')}</b>
                  <span className="adminpage-when">{fmtDateTime(r.complaintAt)}</span>
                  {!r.planExists && <span className="adminpage-chip">{t('admin.reportsDeleted')}</span>}
                </header>
                <p className="adminpage-muted">
                  {t('admin.reportsOwner', { who: r.ownerHandle ? `@${r.ownerHandle}` : t('admin.reportsUnknown') })}
                  {r.ownerEmail && <>{' '}<span className="adminpage-when">{r.ownerEmail}</span></>}
                </p>
                <p className="adminpage-muted">
                  {t('admin.complaintTakenDown', {
                    who: r.decidedByHandle ? `@${r.decidedByHandle}` : t('admin.reportsUnknown'),
                  })}{' '}
                  <span className="adminpage-when">{fmtDateTime(r.createdAt)}</span>
                  {', '}
                  {r.source === 'notice' ? t('admin.complaintAfterReports') : t('admin.complaintOwnInitiative')}
                  {r.source === 'notice' && <>{' '}<span className="adminpage-when">{r.noticeCount}</span></>}
                </p>
                <p className="adminpage-fbmsg">{r.facts}</p>
                <p className="adminpage-muted">{t('admin.complaintOwnerSays')}</p>
                <p className="adminpage-fbmsg">{r.complaintBody}</p>
                {r.complaintStatus === 'open' && (
                  <p className="adminpage-muted">
                    {t(r.unchanged ? 'admin.complaintWouldReinstate' : 'admin.complaintWouldNotReinstate')}
                  </p>
                )}
                {r.complaintStatus !== 'open' && (
                  <p className="adminpage-muted">
                    {t('admin.complaintDecided', {
                      who: r.complaintDecidedByHandle ? `@${r.complaintDecidedByHandle}` : t('admin.reportsUnknown'),
                    })}{' '}
                    <span className="adminpage-when">{fmtDateTime(r.complaintDecidedAt)}</span>
                    {r.complaintStatus === 'reversed' && `, ${t(r.reinstated ? 'admin.complaintReinstated' : 'admin.complaintNotReinstated')}`}
                    {r.complaintNote && <>{': '}{r.complaintNote}</>}
                  </p>
                )}
                <div className="adminpage-row">
                  {r.ownerId && (
                    <button type="button" className="adminpage-btn" onClick={() => onOpenUser(r.ownerId)}>
                      {t('admin.reportsOpenOwner')}
                    </button>
                  )}
                  {r.complaintStatus === 'open' && !open && formFor(r, 'reversed')}
                  {r.complaintStatus === 'open' && !open && formFor(r, 'upheld')}
                </div>
                {r.complaintStatus === 'open' && open && formFor(r, open)}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
