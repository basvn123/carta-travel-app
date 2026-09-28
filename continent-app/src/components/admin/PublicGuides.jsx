import { Fragment } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { fmtDate, initial, rowName } from './format.js';
import { UnpublishGuide } from './UnpublishGuide.jsx';

// The Guides tab: every trip a traveller has made public, newest first,
// with its author and its views. Pure render over usePublicGuides. The
// author cell opens the account through onOpenUser, the same hand-off the
// feedback inbox uses, so a moderator can go from a guide to its owner.
//
// Each row has an Unpublish button (T069, admin_unpublish_guide in
// migration 038). It opens a form under the row that asks for the reason
// for the audit log; the guide then goes private and leaves this list. The
// trip stays in its owner's account and nothing is deleted. The form and
// its state are shared with the Reports tab (UnpublishGuide,
// useUnpublishGuide).
//
// Three states, told apart as the Users tab does: rows, a real empty list,
// and a failure. A failure draws no table, because a header over nothing
// reads as "nobody published anything" when it means "the query did not
// run".
export function PublicGuides({ guidesIndex, onOpenUser, unpublish }) {
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
      {unpublish.notice && <p className="adminpage-ok" role="status">{unpublish.notice}</p>}

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
                <th>{t('admin.colAction')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((g) => (
                <Fragment key={g.id}>
                <tr>
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
                  <td>
                    {unpublish.armed !== `guide:${g.id}` && (
                      <UnpublishGuide
                        unpublish={unpublish}
                        formKey={`guide:${g.id}`}
                        planId={g.id}
                        label={g.label || t('admin.guidesUntitled')}
                      />
                    )}
                  </td>
                </tr>
                {/* The open form gets a full-width row of its own; a table
                    cell is too narrow for a reason field. */}
                {unpublish.armed === `guide:${g.id}` && (
                  <tr>
                    <td colSpan={8}>
                      <UnpublishGuide
                        unpublish={unpublish}
                        formKey={`guide:${g.id}`}
                        planId={g.id}
                        label={g.label || t('admin.guidesUntitled')}
                      />
                    </td>
                  </tr>
                )}
                </Fragment>
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
