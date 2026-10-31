import React, { useEffect, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { Button } from '../components/ui/index.js';
import { CheckIcon, CopyIcon, ShareIcon } from '../components/Icons.jsx';
import { findByHandle, normaliseHandle, handleProblem } from '../auth/profiles.js';
import { buildFriendInviteUrl } from '../auth/friends.js';
import { useTogether, togetherActions } from './useTogether.js';
import { IS_FRIENDS_MOCK, mockFind } from './friendsMock.js';
import { ToneFace, nameOf } from './parts.jsx';

/**
 * Add a friend (T928, T932): the exact handle with Find, the profile it found
 * with Send request, and your own link to hand over. There is no search of
 * people and no suggestion: the lookup answers about one exact handle, and
 * "no such handle" reads the same as "that is you".
 */
export function AddFriend({ back, headRef, pendingHandle, aside = null }) {
  const { t } = useI18n();
  const s = useTogether();
  const [query, setQuery] = useState(pendingHandle || '');
  const [found, setFound] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);
  const myHandle = s.me?.handle || '';
  const link = myHandle ? buildFriendInviteUrl(myHandle) : null;

  useEffect(() => {
    if (!copied) return undefined;
    const id = setTimeout(() => setCopied(false), 2500);
    return () => clearTimeout(id);
  }, [copied]);

  const lookup = async (wanted) => {
    setError(''); setNotice(''); setFound(null);
    const problem = handleProblem(wanted);
    if (problem) { setError(t(problem)); return; }
    if (s.links.some((l) => l.handle === wanted)) { setError(t('friends.errAlready')); return; }
    setBusy(true);
    try {
      const hit = IS_FRIENDS_MOCK ? mockFind(wanted) : await findByHandle(wanted);
      if (!hit || hit.userId === s.userId) setError(t('friends.errNoOne'));
      else setFound(hit);
    } catch {
      setError(t('friends.unavailable'));
    } finally {
      setBusy(false);
    }
  };

  // An invite link lands here with the handle already looked up.
  useEffect(() => {
    if (pendingHandle && pendingHandle !== myHandle) lookup(normaliseHandle(pendingHandle));
  }, [pendingHandle, myHandle]); // eslint-disable-line react-hooks/exhaustive-deps -- once per link

  const send = async () => {
    setError('');
    try {
      await togetherActions.ask(found.userId, found);
      setFound(null);
      setQuery('');
      setNotice(t('tg.requestSentNotice'));
    } catch (err) {
      setError(t(err?.code === 'ALREADY_LINKED' ? 'friends.errAlready' : 'friends.unavailable'));
    }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setError(t('share.copyFailed')); }
  };
  const share = async () => {
    const text = t('friends.inviteText', { handle: myHandle });
    try {
      if (navigator.share) { await navigator.share({ title: 'Carta', text, url: link }); return; }
      await navigator.clipboard.writeText(`${text} ${link}`);
      setCopied(true);
    } catch (err) {
      if (err?.name !== 'AbortError') setError(t('share.copyFailed'));
    }
  };

  return (
    <div className="tg-page">
      <div className="tg-head is-sub">
        {back}
        <h1 className="tg-h1" ref={headRef} tabIndex={-1} data-focus-quiet="">{t('friends.addTitle')}</h1>
      </div>
      <div className="tg-grid">
        <div className="tg-col tg-addw">
          <form className="tg-hand" onSubmit={(e) => { e.preventDefault(); lookup(normaliseHandle(query)); }}>
            <label className="tg-label" htmlFor="tg-handle">{t('tg.handle')}</label>
            <div className="tg-in">
              <span className="acct-handle-row">
                <span className="acct-handle-at" aria-hidden="true">@</span>
                <input
                  id="tg-handle"
                  type="text"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck="false"
                  value={query}
                  onChange={(e) => { setQuery(normaliseHandle(e.target.value)); setFound(null); }}
                />
              </span>
              <Button type="submit" variant="primary" className="frn-look" loading={busy} disabled={!query}>{t('tg.find')}</Button>
            </div>
            {found && (
              <div className="tg-found">
                <ToneFace id={found.userId} name={nameOf(found)} emoji={found.avatarEmoji} />
                <span className="tg-wr-tx"><b>{nameOf(found)}</b><span>@{found.handle}</span></span>
                <Button variant="secondary" size="sm" className="frn-yes" onClick={send}>{t('tg.sendRequest')}</Button>
              </div>
            )}
            {error && <div className="auth-error" role="alert">{error}</div>}
            {notice && <div className="auth-notice auth-notice-inline" role="status">{notice}</div>}
          </form>

          {link && (
            <div className="tg-sharecard">
              <div className="tg-share-tx">
                <b>{t('tg.yourLink')}</b>
                <span className="tg-muted">@{myHandle}</span>
                <span className="tg-share-acts">
                  <Button variant="secondary" size="sm" className="frn-me-copy" iconStart={copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />} onClick={copy}>
                    {copied ? t('share.copied') : t('tg.copyLink')}
                  </Button>
                  <Button variant="secondary" size="sm" className="frn-me-share" iconStart={<ShareIcon size={16} />} onClick={share}>
                    {t('tg.share')}
                  </Button>
                </span>
              </div>
            </div>
          )}
        </div>
        {aside && <div className="tg-col">{aside}</div>}
      </div>
    </div>
  );
}
