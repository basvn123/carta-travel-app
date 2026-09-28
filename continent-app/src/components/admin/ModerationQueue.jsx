import { useI18n } from '../../i18n/index.jsx';
import { fmtDateTime } from './format.js';

// The Feedback tab: the inbox of messages travellers send, triaged by
// status. It is the only moderation queue the product has today; the DSA
// notice-and-action work (T068 onward) is expected to grow it. Pure render
// over useModerationQueue. onOpenUser switches to Users and opens the
// sender's account, which is the shell's business, not this view's.
export function ModerationQueue({ queue, onOpenUser }) {
  const { t } = useI18n();
  const { feedback, fbFilter, setFbFilter, fbBusy, loadFeedback, setFeedbackStatus } = queue;
  return (
    <>
      <h1 className="adminpage-h1">{t('admin.nav.feedback')}</h1>
      <p className="adminpage-muted">{t('admin.feedbackHint')}</p>
      <div className="adminpage-segment" role="radiogroup" aria-label={t('admin.nav.feedback')}>
        {['new', 'open', 'done', 'all'].map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={fbFilter === s}
            className={`adminpage-seg ${fbFilter === s ? 'on' : ''}`}
            onClick={() => { setFbFilter(s); loadFeedback(s); }}
          >
            {t(`admin.fb.${s}`)}
            {s === 'new' && feedback?.new ? ` (${feedback.new})` : ''}
          </button>
        ))}
      </div>
      {fbBusy && <p className="adminpage-muted">{t('account.pleaseWait')}</p>}
      {!fbBusy && (feedback?.rows || []).length === 0 && (
        <p className="adminpage-muted">{t('admin.fbEmpty')}</p>
      )}
      <div className="adminpage-fblist">
        {(feedback?.rows || []).map((f) => (
          <article key={f.id} className="adminpage-fb">
            <header className="adminpage-fbhead">
              <span className={`adminpage-chip kind-${f.kind}`}>{t(`account.feedbackKind.${f.kind}`)}</span>
              <span className="adminpage-fbwho">
                {f.handle ? `@${f.handle}` : f.email || t('admin.fbAnon')}
              </span>
              <span className="adminpage-when">{fmtDateTime(f.createdAt)}</span>
              <span className={`adminpage-chip status-${f.status}`}>{t(`admin.fb.${f.status}`)}</span>
            </header>
            <p className="adminpage-fbmsg">{f.message}</p>
            {f.context && (
              <p className="adminpage-fbctx">
                {[f.context.path, f.context.viewport, f.context.lang]
                  .filter(Boolean).join('  ')}
              </p>
            )}
            <div className="adminpage-row">
              {f.email && (
                <a
                  className="adminpage-btn"
                  href={`mailto:${f.email}?subject=${encodeURIComponent('Re: your Carta feedback')}`}
                >
                  {t('admin.fbReply')}
                </a>
              )}
              {f.status !== 'open' && (
                <button type="button" className="adminpage-btn" onClick={() => setFeedbackStatus(f.id, 'open')}>
                  {t('admin.fbMarkOpen')}
                </button>
              )}
              {f.status !== 'done' && (
                <button type="button" className="adminpage-btn" onClick={() => setFeedbackStatus(f.id, 'done')}>
                  {t('admin.fbMarkDone')}
                </button>
              )}
              {f.userId && (
                <button type="button" className="adminpage-btn" onClick={() => onOpenUser(f.userId)}>
                  {t('admin.fbOpenUser')}
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
