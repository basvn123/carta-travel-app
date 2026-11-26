import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../i18n/index.jsx';
import { Button, IconButton } from '../components/ui/index.js';
import { CheckIcon, CopyIcon, EyeIcon, LinkIcon, ShareIcon } from '../components/Icons.jsx';
import { HouseIcon } from '../components/HouseIcons.jsx';
import { useFocusTrap } from '../hooks/useFocusTrap.js';
import { buildFriendInviteUrl } from '../auth/friends.js';
import { Frame2 } from '../auth/mytrips/atlas/Ink.jsx';
import { useTogether } from './useTogether.js';
import { QrCode } from './Privacy.jsx';
import { ToneFace, nameOf } from './parts.jsx';
import { drawAllowed } from './vrienden.js';

/**
 * Inviting a friend (G16, decision 0017). The link is the existing
 * `#friend=<handle>`; nothing new is stored.
 *
 *   InviteButton   "Uitnodigen" with the person-plus, never icon-only. On a
 *                  phone it opens a sheet (the link, who sees what, Delen,
 *                  Link | QR-code, find by username); from 1100 px a popover
 *                  at the button (the QR, Kopieer link, find by username).
 *                  Esc and a click outside close it; focus returns to the
 *                  button (useFocusTrap hands it back).
 *   GuestInvite    signed out with a friend link: "@bas invites you", three
 *                  ruled steps and Sign in. The handle is held through the
 *                  sign-in round trip (holdFriendHandle in friends.js);
 *                  after it the request is one tap on the Add screen, and
 *                  nothing is sent on anybody's behalf. No name is looked up
 *                  for a signed-out visitor (RLS keeps profiles private).
 */

function useWide() {
  const q = '(min-width: 1100px)';
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(q).matches);
  useEffect(() => {
    const m = window.matchMedia?.(q);
    if (!m) return undefined;
    const on = () => setWide(m.matches);
    m.addEventListener?.('change', on);
    return () => m.removeEventListener?.('change', on);
  }, []);
  return wide;
}

/** Copy and share for your own link, with a polite "Copied". */
function useLinkActions() {
  const { t } = useI18n();
  const s = useTogether();
  const handle = s.me?.handle || '';
  const link = handle ? buildFriendInviteUrl(handle) : null;
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!copied) return undefined;
    const id = setTimeout(() => setCopied(false), 2500);
    return () => clearTimeout(id);
  }, [copied]);
  const copy = async () => {
    setFailed(false);
    try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setFailed(true); }
  };
  // Delen: the system share sheet, else the text and link copied, as
  // ShareCard (AddFriend.jsx) has always done.
  const share = async () => {
    const text = t('friends.inviteText', { handle });
    setFailed(false);
    try {
      if (navigator.share) { await navigator.share({ title: 'Viantra', text, url: link }); return; }
      await navigator.clipboard.writeText(`${text} ${link}`);
      setCopied(true);
    } catch (err) {
      if (err?.name !== 'AbortError') setFailed(true);
    }
  };
  return { handle, link, copied, failed, copy, share };
}

function CopiedNote({ copied, failed }) {
  const { t } = useI18n();
  return (
    <span className="vr-live" role="status" aria-live="polite">
      {copied ? t('share.copied') : failed ? t('share.copyFailed') : ''}
    </span>
  );
}

function InviteSheet({ onClose, onFind }) {
  const { t } = useI18n();
  const panelRef = useRef(null);
  const a = useLinkActions();
  const [mode, setMode] = useState('link');
  // The sheet slides up when a tap opened it, not on a deep link (first paint).
  const [slide] = useState(drawAllowed);
  useFocusTrap(panelRef, onClose);
  return createPortal(
    <div className={`vr-sheet-wrap${slide ? ' is-opened' : ''}`}>
      <div className="vr-scrim" onClick={onClose} aria-hidden="true" />
      <div className="vr-sheet" ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="vr-inv-h">
        <span className="vr-grab" aria-hidden="true" />
        <h2 id="vr-inv-h">{t('vr.inviteTitle')}</h2>
        {mode === 'link' ? (
          <div className="vr-linkbox">
            <LinkIcon size={18} />
            <span className="vr-linkbox-t">{a.link}</span>
            <IconButton label={t('tg.copyLink')} onClick={a.copy}>{a.copied ? <CheckIcon size={18} /> : <CopyIcon size={18} />}</IconButton>
          </div>
        ) : (
          <div className="vr-qr"><QrCode url={a.link} label={t('tg.qrLabel')} /></div>
        )}
        <p className="vr-sees"><EyeIcon size={16} />{t('vr.inviteSees')}</p>
        <Button variant="primary" block iconStart={<ShareIcon size={18} />} onClick={a.share}>{t('tg.share')}</Button>
        <Frame2 label={t('vr.inviteHow')} value={mode} onChange={setMode}
          options={[['link', t('vr.link')], ['qr', t('vr.qr')]]} className="is-wide" />
        <Button variant="quiet" className="vr-lnk" onClick={onFind}>{t('vr.byHandle')}</Button>
        <CopiedNote copied={a.copied} failed={a.failed} />
      </div>
    </div>,
    document.body,
  );
}

function InvitePopover({ onClose, onFind }) {
  const { t } = useI18n();
  const panelRef = useRef(null);
  const a = useLinkActions();
  useFocusTrap(panelRef, onClose);
  useEffect(() => {
    const out = (e) => { if (panelRef.current && !panelRef.current.contains(e.target) && !e.target.closest?.('.vr-invite-btn')) onClose(); };
    document.addEventListener('pointerdown', out);
    return () => document.removeEventListener('pointerdown', out);
  }, [onClose]);
  return (
    <div className="vr-pop" ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="vr-pop-h">
      <h2 id="vr-pop-h">{t('vr.inviteTitle')}</h2>
      <div className="vr-pop-row">
        <div className="vr-qr"><QrCode url={a.link} label={t('tg.qrLabel')} /></div>
        <div className="vr-pop-acts">
          <Button variant="primary" iconStart={a.copied ? <CheckIcon size={18} /> : <CopyIcon size={18} />} onClick={a.copy}>{t('tg.copyLink')}</Button>
          <p className="vr-sees"><EyeIcon size={16} />{t('vr.inviteSees')}</p>
          <Button variant="quiet" className="vr-lnk" onClick={onFind}>{t('vr.byHandle')}</Button>
        </div>
      </div>
      <CopiedNote copied={a.copied} failed={a.failed} />
    </div>
  );
}

/** The one Uitnodigen button and what it opens. `open` may be held by the
 *  page (the `invite` address opens it). */
export function InviteButton({ open, onOpen, onClose, onFind, variant = 'umber', block = false }) {
  const { t } = useI18n();
  const wide = useWide();
  const s = useTogether();
  if (!s.me?.handle) {
    // No handle yet, so no link: the button goes straight to finding by username.
    return (
      <Button variant={variant === 'primary' ? 'primary' : 'secondary'} size={block ? undefined : 'sm'} block={block}
        className={`vr-invite-btn${variant === 'umber' ? ' is-umber' : ''}`} iconStart={<HouseIcon.invite size={18} />} onClick={onFind}>
        {t('vr.invite')}
      </Button>
    );
  }
  return (
    <span className="vr-invite">
      <Button variant={variant === 'primary' ? 'primary' : 'secondary'} size={block ? undefined : 'sm'} block={block}
        className={`vr-invite-btn${variant === 'umber' ? ' is-umber' : ''}`} iconStart={<HouseIcon.invite size={18} />}
        aria-haspopup="dialog" aria-expanded={open} onClick={open ? onClose : onOpen}>
        {t('vr.invite')}
      </Button>
      {open && (wide ? <InvitePopover onClose={onClose} onFind={onFind} /> : <InviteSheet onClose={onClose} onFind={onFind} />)}
    </span>
  );
}

/** Desktop zero state: the QR beside the hero, for a friend next to you. */
export function InviteQr() {
  const { t } = useI18n();
  const a = useLinkActions();
  if (!a.link) return null;
  return (
    <div className="vr-qr is-hero">
      <QrCode url={a.link} label={t('tg.qrLabel')} />
      <p className="vr-qr-cap">{t('vr.scanQr')}</p>
    </div>
  );
}

/** Signed out, opened from a friend's link. */
export function GuestInvite({ handle, onSignIn, headRef }) {
  const { t } = useI18n();
  return (
    <div className="vr-guest">
      <span className="vr-guest-face"><ToneFace id={handle} name={nameOf({ handle })} size="lg" /></span>
      <h1 className="vr-h1" ref={headRef} tabIndex={-1} data-focus-quiet="">{t('vr.guestTitle', { handle })}</h1>
      <ol className="vr-steps" aria-label={t('vr.guestSteps')}>
        <li className="is-done"><span className="vr-step-n" aria-hidden="true"><CheckIcon size={14} /></span>{t('vr.guestStep1')}</li>
        <li><span className="vr-step-n" aria-hidden="true">2</span>{t('vr.guestStep2')}</li>
        <li><span className="vr-step-n" aria-hidden="true">3</span>{t('vr.guestStep3')}</li>
      </ol>
      <Button variant="primary" block onClick={onSignIn}>{t('saved.signIn')}</Button>
    </div>
  );
}
