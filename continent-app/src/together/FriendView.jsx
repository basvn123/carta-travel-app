import React, { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { Button, IconButton } from '../components/ui/index.js';
import { MoreIcon } from '../components/Icons.jsx';
import { useTogether, togetherActions } from './useTogether.js';
import { ToneFace, nameOf } from './parts.jsx';

/**
 * A friend's page (T928 opens it, T930 fills it): their face, name and
 * handle, and a menu that removes them, silently.
 */
export function FriendView({ back, headRef, friendId, onGone }) {
  const { t } = useI18n();
  const s = useTogether();
  const link = s.links.find((l) => l.userId === friendId && l.kind === 'friend');
  const [menu, setMenu] = useState(false);
  const [error, setError] = useState('');
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menu) return undefined;
    const close = (e) => { if (!menuRef.current?.contains(e.target)) setMenu(false); };
    const esc = (e) => { if (e.key === 'Escape') { e.preventDefault(); setMenu(false); } };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc, true); };
  }, [menu]);

  if (!link) {
    return (
      <div className="tg-page">
        <div className="tg-head is-sub">{back}<h1 className="tg-h1" ref={headRef} tabIndex={-1} data-focus-quiet="">{t('friends.title')}</h1></div>
        <p className="tg-muted">{t('tg.friendGone')}</p>
      </div>
    );
  }
  const name = nameOf(link);
  const drop = (fn) => fn(link.id).then(onGone).catch(() => setError(t('friends.unavailable')));

  return (
    <div className="tg-page">
      <div className="tg-head is-sub">{back}</div>
      <div className="tg-fhead">
        <ToneFace id={link.userId} name={name} emoji={link.avatarEmoji} size="lg" />
        <span className="tg-fhead-tx">
          <h1 className="tg-h1" ref={headRef} tabIndex={-1} data-focus-quiet="">{name}</h1>
          <span className="tg-muted">@{link.handle}</span>
        </span>
        <span className="tg-fhead-acts">
          <span className="tg-menu" ref={menuRef}>
            <IconButton label={t('tg.more')} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
              <MoreIcon size={20} />
            </IconButton>
            {menu && (
              <span className="tg-menu-list" role="menu">
                <Button variant="quiet" size="sm" role="menuitem" className="tg-menu-item is-danger" onClick={() => drop(togetherActions.remove)}>
                  {t('friends.remove')}
                </Button>
              </span>
            )}
          </span>
        </span>
      </div>
      {error && <div className="auth-error" role="alert">{error}</div>}
    </div>
  );
}
