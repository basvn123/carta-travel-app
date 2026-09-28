import { useI18n } from '../../i18n/index.jsx';
import { fmtDate, initial, rowName } from './format.js';

// The Guides tab: every trip a traveller has made public, newest first,
// with its author and its views. Pure render over usePublicGuides. The
// author cell opens the account through onOpenUser, the same hand-off the
// feedback inbox uses, so a moderator can go from a guide to its owner.
//
// It is a list to read, not yet a queue to act on: there is no unpublish
// button here. That is the takedown RPC (admin_unpublish_guide) of the
// plan's Phase 2, which logs a reason to the audit trail, and it belongs to
// the task that builds it.
//
// Three states, told apart as the Users tab does: rows, a real empty list,
// and a failure. A failure draws no table, because a header over nothing
// reads as "nobody published anything" when it means "the query did not
// run".
export function PublicGuides({ guidesIndex, onOpenUser }) {
  const { t } = useI18n();
  const { guides, busy, error, load } = guidesIndex;
  const rows = guides?.rows || [];
  return (
    <>
      <div className="adminpage-headrow">
        <h1 className="adminpage-h1">{t('admin.nav.guides')}</h1>
        <button type="button" className="adminpage-btn" disabled={busy} onClick={load}>
          {busy ? t('account.pleaseWait') : t('admin.guidesRefresh')}
        </button>
      </div>
      <p className="adminpage-muted">{t('admin.guidesHint')}</p>
      {guides && guides.viewsCounted === false && (
        <p className="adminpage-muted">{t('admin.guidesViewsNotCounted')}</p>
      )}

      {error && (
        <p className="adminpage-err">
          {error}
          <button type="button" className="adminpage-retry" onClick={load}>
            {t('admin.retry')}
          </button>
        </p>
      )}

      {!error && rows.length === 0 ? (
        (!busy && guides) && <p className="adminpage-muted">{t('admin.guidesEmpty')}</p>
      ) : !error && (
        <div className="adminpage-tablewrap">
          <table className="adminpage-table adminpage-table-static">
            <thead>
              <tr>
                <th>{t('admin.colGuide')}</th>
                <th>{t('admin.colCities')}</th>
                <th>{t('admin.colAuthor')}</th>
                <th>{t('admin.colEmail')}</th>
                <th>{t('admin.colPublished')}</th>
                <th className="num">{t('admin.colViews')}</th>
                <th>{t('admin.colStatus')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((g) => (
                <tr key={g.id}>
                  <td><b>{g.label || t('admin.guidesUntitled')}</b></td>
                  <td>{(g.cities || []).join(', ')}</td>
                  <td>
                    <button
                      type="button"
                      className="adminpage-namebtn"
                      onClick={() => onOpenUser(g.userId)}
                    >
                      <span className="adminpage-ava" aria-hidden="true">
                        {g.avatarEmoji || initial(g)}
                      </span>
                      <span className="adminpage-nametext">
                        <b>{rowName({ ...g, id: g.userId })}</b>
                        {g.handle && <span>@{g.handle}</span>}
                      </span>
                    </button>
                  </td>
                  <td className="mono">{g.email}</td>
                  <td className="mono">{fmtDate(g.publishedAt)}</td>
                  <td className="mono num">{g.views}</td>
                  <td>
                    {!g.inGallery && (
                      <span className="adminpage-chip">
                        {t('admin.guidesNotInGallery')}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!error && rows.length > 0 && (
        <p className="adminpage-count">{t('admin.guidesCount', { n: guides.total })}</p>
      )}
      {!error && rows.some((g) => !g.inGallery) && (
        <p className="adminpage-muted">{t('admin.guidesNotInGalleryHint')}</p>
      )}
    </>
  );
}
