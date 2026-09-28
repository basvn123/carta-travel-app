import React, { useEffect, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { LockIcon } from '../components/Icons.jsx';
import { ContentSection } from './ContentSection.jsx';
import { AdminLock } from '../components/admin/AdminLock.jsx';
import { MissingTables } from '../components/admin/MissingTables.jsx';
import { Overview } from '../components/admin/Overview.jsx';
import { UsersList } from '../components/admin/UsersList.jsx';
import { UserDetail } from '../components/admin/UserDetail.jsx';
import { FeedbackInbox } from '../components/admin/FeedbackInbox.jsx';
import { PublicGuides } from '../components/admin/PublicGuides.jsx';
import { ContentReports } from '../components/admin/ContentReports.jsx';
import { ConfigManager } from '../components/admin/ConfigManager.jsx';
import { AuditLog } from '../components/admin/AuditLog.jsx';
import { useErrText } from '../components/admin/useErrText.js';
import { useMargin } from '../components/admin/useMargin.js';
import { useOverview } from '../components/admin/useOverview.js';
import { useAuditLog } from '../components/admin/useAuditLog.js';
import { useFeedbackInbox } from '../components/admin/useFeedbackInbox.js';
import { useContentOverrides } from '../components/admin/useContentOverrides.js';
import { useConfigManager } from '../components/admin/useConfigManager.js';
import { useUsersList } from '../components/admin/useUsersList.js';
import { useUserDetail } from '../components/admin/useUserDetail.js';
import { usePublicGuides } from '../components/admin/usePublicGuides.js';
import { useContentReports } from '../components/admin/useContentReports.js';
import { useUnpublishGuide } from '../components/admin/useUnpublishGuide.js';

// The back office, as a page rather than a drawer.
//
// It started as a spoke inside the account panel, which was the wrong shape
// the moment it had to show a table: 440px of slide-over is a place to change
// your own name, not a place to read every account you have. So this takes
// the whole viewport, keeps the app's own typography (Fraunces on headings,
// mono on every measured fact) and lays the work out in eight sections that
// each answer one question: how is it going, who are they, what does the
// catalogue say, what have travellers published, what has been reported as
// illegal, what are they telling us, what is the site saying, and what has
// been done.
//
// SECURITY, because this file will be read by somebody wondering. Nothing
// here is a permission. Every call goes through an RPC that re-checks
// membership in public.admin_users against the caller's signed token, rate
// limits the caller, and writes the outcome to an append-only trail. A
// visitor who edits this bundle to force the page open sees the same empty
// screen with "forbidden" on it, because the browser has no say in the
// answer. The lock below is a second pair of eyes on a warm session, not a
// gate; the gate is in the database.
//
// SHAPE (T062). This file is the layout and the tab routing and nothing
// else. Each tab is a pure view in src/components/admin/, and its state
// lives in a matching use* hook there. The hooks are called here, not in
// the views, for two reasons. A tab that is not showing is unmounted, and
// state held inside it would reset and refetch on every visit, where the
// page has always loaded everything once at unlock and kept edits across
// tabs. And the domains talk to each other: an account action reloads the
// list, the stats and the audit trail; a feedback row opens an account. The
// hooks are called in the order the one big unlock effect used to fire its
// RPCs, so the network sequence at unlock is the same as before the split.
//
// GUIDES (T067) is the one hook that does not load at unlock: it loads the
// first time its tab is shown and keeps the list after that, so the unlock
// sequence above is unchanged and the unbounded list of public guides is
// only fetched by somebody who opened the tab. REPORTS (T068), the DSA notice
// queue, loads the same way. It is its own tab rather than part of the
// feedback inbox; ContentReports.jsx says why. The takedown (T069) is one
// hook shared by both tabs, so only one Unpublish form is open at a time and
// a takedown from either tab reloads whichever of the two lists is loaded.

const SECTIONS = ['overview', 'users', 'content', 'guides', 'reports', 'feedback', 'site', 'audit'];

export function AdminPage({ onClose }) {
  const { t } = useI18n();
  const errText = useErrText();

  const [unlocked, setUnlocked] = useState(false);
  const [section, setSection] = useState('overview');

  // Escape closes the page, the way every other overlay in the app behaves.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const marginDash = useMargin(unlocked);
  const overview = useOverview(unlocked);
  const { audit, auditBusy, loadAudit } = useAuditLog(unlocked);
  const queue = useFeedbackInbox(unlocked, overview.refreshAnalytics);
  const content = useContentOverrides(unlocked);
  const config = useConfigManager(unlocked, errText, loadAudit);
  const list = useUsersList(unlocked, errText);
  const account = useUserDetail({
    errText, reloadList: list.reloadList, refreshStats: overview.refreshStats, loadAudit,
  });
  const { detail, setDetail } = account;
  const guidesIndex = usePublicGuides(unlocked && section === 'guides', errText);
  const reports = useContentReports(unlocked && section === 'reports', errText);
  const unpublish = useUnpublishGuide({ errText, guidesIndex, reports, loadAudit });

  // ---- the lock -----------------------------------------------------------
  if (!unlocked) {
    return <AdminLock onUnlock={() => setUnlocked(true)} onClose={onClose} />;
  }

  return (
    <div className="adminpage">
      <header className="adminpage-bar">
        <div className="adminpage-brand">
          <LockIcon size={15} />
          <span>{t('admin.title')}</span>
        </div>
        <nav className="adminpage-nav" aria-label={t('admin.title')}>
          {SECTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className={`adminpage-navbtn ${section === s && !detail ? 'on' : ''}`}
              aria-current={section === s && !detail ? 'page' : undefined}
              onClick={() => { setSection(s); setDetail(null); }}
            >
              {t(`admin.nav.${s}`)}
            </button>
          ))}
        </nav>
        <button type="button" className="adminpage-close" onClick={onClose} aria-label={t('account.close')}>
          x
        </button>
      </header>

      <main className="adminpage-body">
        <MissingTables stats={overview.stats} health={overview.health} />

        {detail ? <UserDetail account={account} /> : (
          <>
            {section === 'overview' && (
              <Overview overview={overview} marginDash={marginDash} audit={audit} />
            )}

            {section === 'users' && (
              <UsersList list={list} openUser={account.openUser} />
            )}

            {section === 'content' && (
              <ContentSection
                overrides={content.overrides}
                onOverridesChanged={async () => { await content.loadOverrides(); loadAudit(25); }}
                errText={errText}
              />
            )}

            {section === 'guides' && (
              <PublicGuides
                guidesIndex={guidesIndex}
                onOpenUser={(id) => { setSection('users'); account.openUser(id); }}
                unpublish={unpublish}
              />
            )}

            {section === 'reports' && (
              <ContentReports
                queue={reports}
                onOpenUser={(id) => { setSection('users'); account.openUser(id); }}
                unpublish={unpublish}
              />
            )}

            {section === 'feedback' && (
              <FeedbackInbox
                queue={queue}
                onOpenUser={(id) => { setSection('users'); account.openUser(id); }}
              />
            )}

            {section === 'site' && (
              <ConfigManager config={config} />
            )}

            {section === 'audit' && (
              <AuditLog audit={audit} auditBusy={auditBusy} loadAudit={loadAudit} />
            )}
          </>
        )}
      </main>
    </div>
  );
}
