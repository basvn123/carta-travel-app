import React from 'react';
import { Pressable } from '../../components/ui/Pressable.jsx';
import { useI18n } from '../../i18n/index.jsx';
import { Button, IconButton } from '../../components/ui/index.js';
import { HouseIcon } from '../../components/HouseIcons.jsx';
import { ArrowRightIcon, CopyIcon, TrashIcon } from '../../components/Icons.jsx';
import { MAX_STYLES } from '../../lib/travelStyles.js';
import { StyleCards } from './StyleCards.jsx';
import { styleName } from './styleBits.jsx';

/** Whether the explainer is folded on a phone, kept per device. */
const FOLD_KEY = 'carta.studio.explainer';

function useNarrow() {
  const q = '(max-width: 768px)';
  const [narrow, setNarrow] = React.useState(() => typeof window !== 'undefined' && window.matchMedia?.(q).matches);
  React.useEffect(() => {
    const mq = window.matchMedia?.(q);
    if (!mq) return undefined;
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
}

/**
 * View 1, your travel styles (decision.md): what a style does, the styles as
 * cards (tap to switch), each card's own menu, the hold on the card in use,
 * and the one way to make a new one.
 */
export function StyleOverview({ ts, figures, fresh, escRef, onClose, onCreate, onEdit, taste = null }) {
  const { t } = useI18n();
  const [menuFor, setMenuFor] = React.useState('');
  const [confirmFor, setConfirmFor] = React.useState('');
  const list = ts.list;
  const full = list.length >= MAX_STYLES;
  const changed = Boolean(ts.active && (ts.changed || ts.held));

  // After a control goes away under the finger (Delete, Keep, Undo) focus
  // lands on what is there next, never on the page behind: a card by its
  // id, else the New tile, else the empty state's button.
  const bodyRef = React.useRef(null);
  const focusAfter = (id) => requestAnimationFrame(() => requestAnimationFrame(() => {
    const root = bodyRef.current;
    if (!root) return;
    const el = (id && root.querySelector(`[data-sid="${id}"]`)) || root.querySelector('.sst-new') || root.querySelector('.sst-go');
    el?.focus();
  }));

  // Escape closes the card menu first and keeps the sheet; focus goes back
  // to the More button that opened it.
  const moreRefs = React.useRef(new Map());
  const closeMenu = React.useCallback(() => {
    const id = menuFor;
    setMenuFor('');
    setConfirmFor('');
    requestAnimationFrame(() => moreRefs.current.get(id)?.focus());
  }, [menuFor]);
  React.useEffect(() => {
    escRef.current = () => {
      if (confirmFor) { setConfirmFor(''); return true; }
      if (menuFor) { closeMenu(); return true; }
      return false;
    };
    return () => { escRef.current = null; };
  }, [escRef, menuFor, confirmFor, closeMenu]);

  // The explainer folds to its heading on a phone once there is a style to
  // look at; the traveller's own open or close is kept per device.
  const narrow = useNarrow();
  const [fold, setFold] = React.useState(() => {
    try { return window.localStorage.getItem(FOLD_KEY) || ''; } catch { return ''; }
  });
  const folded = narrow && list.length > 0 && fold !== 'open';
  const toggleFold = () => {
    const next = folded ? 'open' : 'closed';
    setFold(next);
    try { window.localStorage.setItem(FOLD_KEY, next); } catch { /* private mode */ }
  };

  const more = (s) => (
    <IconButton
      ref={(el) => { if (el) moreRefs.current.set(s.id, el); else moreRefs.current.delete(s.id); }}
      className="sst-more"
      label={t('studio.more', { name: styleName(t, s) })}
      aria-expanded={menuFor === s.id}
      aria-controls={menuFor === s.id ? `sst-menu-${s.id}` : undefined}
      onClick={() => { setConfirmFor(''); setMenuFor(menuFor === s.id ? '' : s.id); }}
    >
      <HouseIcon.more size={20} />
    </IconButton>
  );

  const below = (s) => (
    <>
      {changed && s.id === ts.activeId && (
        <div className="sst-held">
          <span className="sst-held-text">{t('studio.heldTitle')}</span>
          <span className="sst-held-acts">
            <Button variant="quiet" size="sm" aria-label={t('studio.heldKeepAria', { name: styleName(t, s) })} onClick={() => { ts.keep(); focusAfter(s.id); }}>{t('studio.heldKeep')}</Button>
            <Button variant="quiet" size="sm" aria-label={t('studio.heldUndoAria', { name: styleName(t, s) })} onClick={() => { ts.revert(); focusAfter(s.id); }}>{t('studio.heldUndo')}</Button>
          </span>
        </div>
      )}
      {menuFor === s.id && (
        <CardMenu
          id={`sst-menu-${s.id}`}
          t={t}
          name={styleName(t, s)}
          canCopy={!full}
          confirming={confirmFor === s.id}
          onEdit={() => onEdit(s.id)}
          onCopy={() => {
            ts.duplicate(s.id, t('studio.copyOf', { name: styleName(t, s) }).slice(0, 40));
            closeMenu();
          }}
          onAskDelete={() => setConfirmFor(s.id)}
          onKeep={() => setConfirmFor('')}
          onDelete={() => {
            const i = list.findIndex((x) => x.id === s.id);
            const next = list[i + 1] || list[i - 1];
            ts.remove(s.id); setMenuFor(''); setConfirmFor('');
            focusAfter(next?.id);
          }}
        />
      )}
    </>
  );

  return (
    <>
      <header className="sst-head">
        <h2 className="sst-title" id="sst-title">{t('studio.title')}</h2>
        <IconButton className="sst-close" label={t('studio.close')} onClick={onClose}>
          <HouseIcon.close size={18} />
        </IconButton>
      </header>
      <div className="sst-body" ref={bodyRef}>
        <section className={`sst-why${folded ? ' is-folded' : ''}`} aria-labelledby="sst-why-title">
          <div className="sst-why-top">
            <h3 className="sst-why-title" id="sst-why-title">{t('studio.whyTitle')}</h3>
            {narrow && list.length > 0 && (
              <Pressable className="sst-why-toggle" aria-expanded={!folded} aria-controls="sst-why-rows" onClick={toggleFold}>
                {t('studio.howItWorks')}
                <HouseIcon.next size={16} className="sst-why-chev" />
              </Pressable>
            )}
          </div>
          <div className="sst-why-rows" id="sst-why-rows" hidden={folded}>
            <p className="sst-why-row">
              <span className="sst-why-ic" aria-hidden="true"><HouseIcon.bed size={20} /></span>
              <span className="sst-why-text"><b className="sst-why-head">{t('studio.whyStayHead')}</b><span>{t('studio.whyStay')}</span></span>
            </p>
            <p className="sst-why-row">
              <span className="sst-why-ic" aria-hidden="true"><HouseIcon.signpost size={20} /></span>
              <span className="sst-why-text"><b className="sst-why-head">{t('studio.whyExploreHead')}</b><span>{t('studio.whyExplore')}</span></span>
            </p>
          </div>
        </section>

        {list.length === 0 ? (
          <div className="sst-empty">
            <span className="sst-empty-disc" aria-hidden="true"><HouseIcon.pack size={30} /></span>
            <h3 className="sst-empty-title">{t('studio.emptyTitle')}</h3>
            <p className="sst-empty-line">{t('studio.emptyLine')}</p>
            <Button variant="primary" className="sst-go" iconEnd={<ArrowRightIcon size={18} />} onClick={onCreate}>
              {t('studio.create')}
            </Button>
          </div>
        ) : (
          <>
            <StyleCards
              list={list}
              activeId={ts.activeId}
              onPick={(id) => { setMenuFor(''); ts.switchTo(id); }}
              label={t('studio.title')}
              figures={figures}
              aside={more}
              below={below}
              fresh={fresh}
            />
            {!ts.activeId && <p className="sst-note">{t('studio.noneActive')}</p>}
            {full ? (
              <p className="sst-note">{t('studio.max')}</p>
            ) : (
              <Pressable className="sst-new" onClick={onCreate}>
                <span className="sst-new-disc" aria-hidden="true"><HouseIcon.plus size={20} /></span>
                {t('studio.new')}
              </Pressable>
            )}
          </>
        )}
        {taste}
      </div>
    </>
  );
}

/** A card's menu, inline under it: Edit, Duplicate (while there is room)
 *  and Delete, which asks in place, the safe answer first and focused. */
function CardMenu({ id, t, name, canCopy, confirming, onEdit, onCopy, onAskDelete, onKeep, onDelete }) {
  const first = React.useRef(null);
  const keep = React.useRef(null);
  React.useEffect(() => { (confirming ? keep : first).current?.focus(); }, [confirming]);
  if (confirming) {
    return (
      <div className="sst-menu is-confirm" id={id} role="group" aria-labelledby={`${id}-ask`}>
        <p className="sst-menu-ask" id={`${id}-ask`}>{t('studio.deleteAsk', { name })}</p>
        <span className="sst-menu-acts">
          <Button ref={keep} variant="secondary" size="sm" onClick={onKeep}>{t('studio.deleteNo')}</Button>
          <Button variant="danger" size="sm" iconStart={<TrashIcon size={16} />} onClick={onDelete}>{t('studio.deleteYes')}</Button>
        </span>
      </div>
    );
  }
  return (
    <div className="sst-menu" id={id} role="group" aria-label={t('studio.more', { name })}>
      <Button ref={first} variant="quiet" size="sm" iconStart={<HouseIcon.edit size={16} />} onClick={onEdit}>{t('studio.edit')}</Button>
      {canCopy && <Button variant="quiet" size="sm" iconStart={<CopyIcon size={16} />} onClick={onCopy}>{t('studio.duplicate')}</Button>}
      <Button variant="quiet" size="sm" iconStart={<TrashIcon size={16} />} onClick={onAskDelete}>{t('studio.delete')}</Button>
    </div>
  );
}
