import { useI18n } from '../../i18n/index.jsx';

// The Site tab: maintenance mode, the public notice, and the feature flags,
// each saved to site_config through admin_set_config. Pure render over
// useConfigManager.
export function ConfigManager({ config }) {
  const { t } = useI18n();
  const {
    maintOn, setMaintOn, maintText, setMaintText, maintBusy, maintSaved, setMaintSaved, maintErr,
    noticeOn, setNoticeOn, noticeText, setNoticeText, noticeTone, setNoticeTone,
    noticeBusy, noticeSaved, setNoticeSaved, noticeErr,
    flags, setFlags, newFlag, setNewFlag, flagsBusy, flagsSaved, setFlagsSaved, flagsErr,
    saveNotice, saveMaintenance, saveFlags,
    keyRows, visBusy, visErr, setKeyPublic,
  } = config;
  return (
    <>
      <h1 className="adminpage-h1">{t('admin.nav.site')}</h1>
      <section className="adminpage-card adminpage-maint">
        <h3 className="adminpage-h3">{t('admin.maintTitle')}</h3>
        <p className="adminpage-muted">{t('admin.maintHint')}</p>
        <label className="adminpage-check">
          <input
            type="checkbox"
            checked={maintOn}
            onChange={(e) => { setMaintOn(e.target.checked); setMaintSaved(false); }}
          />
          <span>{t('admin.maintEnabled')}</span>
        </label>
        <textarea
          className="adminpage-textarea"
          rows={2}
          maxLength={500}
          value={maintText}
          placeholder={t('admin.maintPlaceholder')}
          onChange={(e) => { setMaintText(e.target.value); setMaintSaved(false); }}
        />
        {maintErr && <p className="adminpage-err">{maintErr}</p>}
        <button
          type="button"
          className={`adminpage-btn wide ${maintOn ? 'danger solid' : ''}`}
          disabled={maintBusy}
          onClick={saveMaintenance}
        >
          {maintBusy ? t('account.pleaseWait')
            : maintSaved ? t('admin.maintSaved')
            : maintOn ? t('admin.maintClose') : t('admin.maintOpen')}
        </button>
      </section>
      <div className="adminpage-cols">
        <section className="adminpage-card">
          <h3 className="adminpage-h3">{t('admin.noticeTitle')}</h3>
          <p className="adminpage-muted">{t('admin.noticeHint')}</p>
          <label className="adminpage-check">
            <input
              type="checkbox"
              checked={noticeOn}
              onChange={(e) => { setNoticeOn(e.target.checked); setNoticeSaved(false); }}
            />
            <span>{t('admin.noticeEnabled')}</span>
          </label>
          <textarea
            className="adminpage-textarea"
            rows={3}
            maxLength={280}
            value={noticeText}
            placeholder={t('admin.noticePlaceholder')}
            onChange={(e) => { setNoticeText(e.target.value); setNoticeSaved(false); }}
          />
          <div className="adminpage-segment" role="radiogroup" aria-label={t('admin.noticeTitle')}>
            {['info', 'warn'].map((tone) => (
              <button
                key={tone}
                type="button"
                role="radio"
                aria-checked={noticeTone === tone}
                className={`adminpage-seg ${noticeTone === tone ? 'on' : ''}`}
                onClick={() => { setNoticeTone(tone); setNoticeSaved(false); }}
              >
                {t(tone === 'warn' ? 'admin.noticeToneWarn' : 'admin.noticeToneInfo')}
              </button>
            ))}
          </div>
          {noticeErr && <p className="adminpage-err">{noticeErr}</p>}
          <button
            type="button"
            className="adminpage-btn primary wide"
            disabled={noticeBusy || (noticeOn && !noticeText.trim())}
            onClick={saveNotice}
          >
            {noticeBusy ? t('account.pleaseWait') : noticeSaved ? t('admin.noticeSaved') : t('admin.noticeSave')}
          </button>
        </section>

        <section className="adminpage-card">
          <h3 className="adminpage-h3">{t('admin.flagsTitle')}</h3>
          <p className="adminpage-muted">{t('admin.flagsHint')}</p>
          {Object.keys(flags).length === 0 && (
            <p className="adminpage-muted">{t('admin.flagsNone')}</p>
          )}
          <div className="adminpage-flags">
            {Object.entries(flags).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => (
              <div key={k} className="adminpage-flag">
                <code>{k}</code>
                <button
                  type="button"
                  role="switch"
                  aria-checked={v}
                  className={`adminpage-switch ${v ? 'on' : ''}`}
                  onClick={() => { setFlags((f) => ({ ...f, [k]: !v })); setFlagsSaved(false); }}
                >
                  {v ? t('admin.flagOn') : t('admin.flagOff')}
                </button>
                <button
                  type="button"
                  className="adminpage-flagdel"
                  aria-label={t('admin.flagRemove')}
                  onClick={() => {
                    setFlags((f) => { const n = { ...f }; delete n[k]; return n; });
                    setFlagsSaved(false);
                  }}
                >
                  x
                </button>
              </div>
            ))}
          </div>
          <div className="adminpage-row">
            <input
              className="adminpage-lock-input mono"
              value={newFlag}
              aria-label={t('admin.flagAddLabel')}
              placeholder="beta_map"
              onChange={(e) => setNewFlag(
                e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 40),
              )}
            />
            <button
              type="button"
              className="adminpage-btn"
              disabled={!newFlag || flags[newFlag] !== undefined}
              onClick={() => {
                setFlags((f) => ({ ...f, [newFlag]: false }));
                setNewFlag(''); setFlagsSaved(false);
              }}
            >
              {t('admin.flagAdd')}
            </button>
          </div>
          {flagsErr && <p className="adminpage-err">{flagsErr}</p>}
          <button
            type="button"
            className="adminpage-btn primary wide"
            disabled={flagsBusy}
            onClick={saveFlags}
          >
            {flagsBusy ? t('account.pleaseWait') : flagsSaved ? t('admin.flagsSaved') : t('admin.flagsSave')}
          </button>
        </section>
      </div>

      {keyRows && keyRows.length > 0 && (
        <section className="adminpage-card">
          <h3 className="adminpage-h3">{t('admin.visTitle')}</h3>
          <p className="adminpage-muted">{t('admin.visHint')}</p>
          <ul className="adminpage-keylist">
            {keyRows.map((k) => (
              <li key={k.key}>
                <code>{k.key}</code>
                <span className="adminpage-muted adminpage-keymeta">
                  {k.required ? t('admin.visRequired') : (k.by ? `@${k.by}` : '')}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={!!k.public}
                  aria-label={`${k.key}: ${k.public ? t('admin.visPublic') : t('admin.visPrivate')}`}
                  className={`adminpage-switch ${k.public ? 'on' : ''}`}
                  disabled={k.required || visBusy === k.key}
                  onClick={() => setKeyPublic(k.key, !k.public)}
                >
                  {k.public ? t('admin.visPublic') : t('admin.visPrivate')}
                </button>
              </li>
            ))}
          </ul>
          {visErr && <p className="adminpage-err" role="alert">{visErr}</p>}
        </section>
      )}
    </>
  );
}
