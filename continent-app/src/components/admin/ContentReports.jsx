import { useI18n } from '../../i18n/index.jsx';
import { fmtDateTime } from './format.js';
import { buildGuideUrl } from '../../community/guides.js';
import { UnpublishGuide } from './UnpublishGuide.jsx';
import { DecisionForm } from './DecisionForm.jsx';
import { ModerationComplaints } from './ModerationComplaints.jsx';

const DISMISS = {
  arm: 'admin.dismissArm', hint: 'admin.dismissHint', label: 'admin.dismissReasonLabel',
  placeholder: 'admin.dismissPlaceholder', go: 'admin.dismissGo',
};

// The Reports tab: the DSA notice-and-action queue. Every report a visitor
// filed against a public guide through report_guide (migration 037), newest
// first. Pure render over useContentReports.
//
// WHY ITS OWN TAB AND NOT THE FEEDBACK INBOX (T068, register row T062-d).
// A notice is a legal record about one guide, filed by anyone, that has to
// end in a decision with a statement of reasons (T070). Feedback is a note
// to the team about the product. They differ in who may file, what the row
// points at, what "done" means and how long it is kept, so mixing them in one
// list would make a moderator triage legal notices between bug reports. The
// feedback view keeps its own file, now named FeedbackInbox.
//
// A report on a guide that is still public has an Unpublish button (T069,
// admin_unpublish_guide in migration 038), the same form as on the Guides
// tab. Taking the guide down moves every new report on it to actioned, so
// they leave the New filter together, and writes the statement of reasons
// the owner reads in My trips (T070, migration 039). A report the
// moderator decides not to act on, including one on a guide that is no
// longer public, has Dismiss, which asks for the reason. Every decided
// card says who decided, when and why. The owner hand-off and the guide
// link are here so a moderator can read what was reported first.
//
// Owners' complaints against takedowns sit above the notices, in
// ModerationComplaints; that file says why they share this tab.
//
// Since migration 051 a card also shows the name the notifier gave, if any,
// and whether they confirmed the notice in good faith (older notices were
// filed before the form asked). A contact email is cleared the moment the
// report is decided, so a new report with an email says to reply first.
//
// Three states, as the Guides tab: rows, a real empty queue, and a failure,
// which draws no list.
export function ContentReports({ queue, onOpenUser, unpublish, complaints, decision }) {
  const { t } = useI18n();
  const { reports, filter, choose, busy, error, reload } = queue;
  const rows = reports?.rows || [];
  return (
    <>
      <div className="adminpage-headrow">
        <h1 className="adminpage-h1">{t('admin.nav.reports')}</h1>
        <button type="button" className="adminpage-btn" disabled={busy} onClick={reload}>
          {busy ? t('account.pleaseWait') : t('admin.reportsRefresh')}
        </button>
      </div>
      <p className="adminpage-muted">{t('admin.reportsHint')}</p>
      {unpublish.notice && <p className="adminpage-ok" role="status">{unpublish.notice}</p>}
      {decision.notice && <p className="adminpage-ok" role="status">{decision.notice}</p>}
      <ModerationComplaints list={complaints} decision={decision} onOpenUser={onOpenUser} />
      <h2 className="adminpage-h2">{t('admin.reportsNoticesTitle')}</h2>
      <div className="adminpage-segment" role="radiogroup" aria-label={t('admin.nav.reports')}>
        {['new', 'all'].map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={filter === s}
            className={`adminpage-seg ${filter === s ? 'on' : ''}`}
            onClick={() => choose(s)}
          >
            {t(`admin.reports.${s}`)}
            {s === 'new' && reports?.new ? ` (${reports.new})` : ''}
          </button>
        ))}
      </div>

      {error && (
        <p className="adminpage-err">
          {error}
          <button type="button" className="adminpage-retry" onClick={reload}>
            {t('admin.retry')}
          </button>
        </p>
      )}

      {!error && !busy && reports && rows.length === 0 && (
        <p className="adminpage-muted">{t('admin.reportsEmpty')}</p>
      )}

      {!error && (
        <div className="adminpage-fblist">
          {rows.map((r) => {
            const url = buildGuideUrl(r.planId);
            const retitled = r.planExists && r.currentLabel !== r.planLabel;
            return (
              <article key={r.id} className="adminpage-fb">
                <header className="adminpage-fbhead">
                  <span className={`adminpage-chip status-${r.status}`}>{t(`admin.reports.${r.status}`)}</span>
                  <b>{r.planLabel || t('admin.guidesUntitled')}</b>
                  <span className="adminpage-when">{fmtDateTime(r.createdAt)}</span>
                  {!r.planExists && <span className="adminpage-chip">{t('admin.reportsDeleted')}</span>}
                  {r.planExists && !r.stillPublic && <span className="adminpage-chip">{t('admin.reportsNotPublic')}</span>}
                </header>
                <p className="adminpage-fbmsg">{r.reason}</p>
                {/* Prose in sans, measured facts (addresses, counts) in mono. */}
                <p className="adminpage-muted">
                  {t('admin.reportsOwner', {
                    who: r.ownerHandle ? `@${r.ownerHandle}` : t('admin.reportsUnknown'),
                  })}
                  {r.ownerEmail && <>{' '}<span className="adminpage-when">{r.ownerEmail}</span></>}
                </p>
                <p className="adminpage-muted">
                  {t('admin.reportsFrom', {
                    who: r.reporterHandle ? `@${r.reporterHandle}` : t('admin.reportsAnon'),
                  })}
                  {r.contactEmail
                    ? <>{' '}<span className="adminpage-when">{r.contactEmail}</span></>
                    : `, ${t('admin.reportsNoEmail')}`}
                </p>
                {(r.reporterName || r.goodFaith !== undefined) && (
                  <p className="adminpage-muted">
                    {r.reporterName && <>{t('admin.reportsName', { name: r.reporterName })}{'. '}</>}
                    {r.goodFaith === true ? t('admin.reportsGoodFaith') : t('admin.reportsNoGoodFaith')}
                  </p>
                )}
                {r.status === 'new' && r.contactEmail && (
                  <p className="adminpage-muted">{t('admin.reportsEmailCleared')}</p>
                )}
                <p className="adminpage-muted">
                  {t('admin.reportsOnGuide')}{' '}
                  <span className="adminpage-when">{r.planTotal}</span>
                  {', '}{t('admin.reportsFromSource')}{' '}
                  <span className="adminpage-when">{r.sourceTotal}</span>
                </p>
                {retitled && (
                  <p className="adminpage-muted">{t('admin.reportsRetitled', { label: r.currentLabel || '' })}</p>
                )}
                {r.decidedAt && (
                  <p className="adminpage-muted">
                    {t('admin.reportsDecided', {
                      who: r.decidedByHandle ? `@${r.decidedByHandle}` : t('admin.reportsUnknown'),
                    })}{' '}
                    <span className="adminpage-when">{fmtDateTime(r.decidedAt)}</span>
                    {r.decisionNote && <>{': '}{r.decisionNote}</>}
                  </p>
                )}
                <div className="adminpage-row">
                  {url && r.stillPublic && (
                    <a className="adminpage-btn" href={url} target="_blank" rel="noopener noreferrer">
                      {t('admin.reportsOpenGuide')}
                    </a>
                  )}
                  {r.contactEmail && (
                    <a
                      className="adminpage-btn"
                      href={`mailto:${r.contactEmail}?subject=${encodeURIComponent('Your report about a Carta guide')}`}
                    >
                      {t('admin.reportsReply')}
                    </a>
                  )}
                  {r.ownerId && (
                    <button type="button" className="adminpage-btn" onClick={() => onOpenUser(r.ownerId)}>
                      {t('admin.reportsOpenOwner')}
                    </button>
                  )}
                  {r.stillPublic && unpublish.armed !== `report:${r.id}` && (
                    <UnpublishGuide
                      unpublish={unpublish}
                      formKey={`report:${r.id}`}
                      planId={r.planId}
                      label={r.currentLabel || r.planLabel || t('admin.guidesUntitled')}
                    />
                  )}
                  {r.status === 'new' && decision.armed !== `dismiss:${r.id}` && (
                    <DecisionForm
                      decision={decision}
                      kind="dismiss"
                      id={r.id}
                      copy={DISMISS}
                      ariaLabel={t('admin.dismissArmFor', { label: r.planLabel || t('admin.guidesUntitled') })}
                    />
                  )}
                </div>
                {r.status === 'new' && decision.armed === `dismiss:${r.id}` && (
                  <DecisionForm decision={decision} kind="dismiss" id={r.id} copy={DISMISS} />
                )}
                {r.stillPublic && unpublish.armed === `report:${r.id}` && (
                  <UnpublishGuide
                    unpublish={unpublish}
                    formKey={`report:${r.id}`}
                    planId={r.planId}
                    label={r.currentLabel || r.planLabel || t('admin.guidesUntitled')}
                  />
                )}
              </article>
            );
          })}
        </div>
      )}

      {!error && rows.length > 0 && (
        <p className="adminpage-count">{t('admin.reportsCount', { n: reports.total })}</p>
      )}
    </>
  );
}
