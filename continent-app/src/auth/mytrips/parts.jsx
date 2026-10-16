import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../i18n/index.jsx';
import { useFocusTrap } from '../../hooks/useFocusTrap.js';
import { Button, IconButton, Field, Money } from '../../components/ui/index.js';
import { MoreIcon, TrashIcon, PlusIcon, CloseIcon, PersonIcon } from '../../components/Icons.jsx';
import { crewLabel, crewInitials, namedCrew, newCrewMember, MAX_CREW } from '../tripCrew.js';
import { useSettledFigure } from '../../lib/figureChange.js';

/**
 * The small parts every My trips tab shares (T434). The tabs themselves are
 * in this folder; SavedTripsPanel keeps the state and the data.
 */

/** How long a removal is held behind its Undo (carta-design: six seconds). */
export const UNDO_MS = 6000;

/**
 * "More" for one trip or plan: a 44 px IconButton opening a menu with the
 * secondary actions and Remove last, in --danger. Remove runs at once and the
 * page offers Undo for six seconds. Arrow keys walk the menu, Escape closes
 * it and returns focus.
 */
export function CardMenu({ actions = [], onRemove, removeLabel, label }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  const btnRef = useRef(null);

  useEffect(() => {
    if (open) boxRef.current?.querySelector('[role="menuitem"]')?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    // Capture phase, and the key stops here: App keeps its own Escape stack.
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
      btnRef.current?.focus();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);
  const onMenuKey = (e) => {
    const items = [...(boxRef.current?.querySelectorAll('[role="menuitem"]') || [])];
    if (!items.length) return;
    const at = items.indexOf(document.activeElement);
    const next = e.key === 'ArrowDown' ? items[(at + 1) % items.length]
      : e.key === 'ArrowUp' ? items[(at - 1 + items.length) % items.length]
        : e.key === 'Home' ? items[0] : e.key === 'End' ? items[items.length - 1] : null;
    if (next) { e.preventDefault(); next.focus(); }
  };
  if (!actions.length && !onRemove) return null;
  return (
    <div
      className="mt-menu"
      ref={boxRef}
      // Tabbing out of the menu closes it, as a menu does (T434 audit).
      onBlur={(e) => { if (open && !boxRef.current?.contains(e.relatedTarget)) setOpen(false); }}
    >
      <IconButton
        ref={btnRef}
        label={label || t('saved.actions')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreIcon size={18} />
      </IconButton>
      {open && (
        <div className="mt-menu-pop" role="menu" onKeyDown={onMenuKey}>
          {actions.map((a) => (
            <Button
              key={a.key}
              variant="quiet"
              role="menuitem"
              className="mt-menu-item"
              iconStart={a.icon}
              onClick={() => { setOpen(false); a.onClick(); }}
            >
              {a.label}
            </Button>
          ))}
          {onRemove && (
            <Button
              variant="quiet"
              role="menuitem"
              className="mt-menu-item is-danger"
              aria-label={removeLabel}
              iconStart={<TrashIcon size={16} />}
              onClick={() => { setOpen(false); onRemove(); }}
            >
              {t('saved.remove')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The Undo toast, portalled into the shell's one bottom slot so it stacks
 * with every other transient message. Undo takes focus when the removal took
 * the focused control away with it.
 */
export function UndoToast({ label, onUndo, onClose }) {
  const { t } = useI18n();
  const undoRef = useRef(null);
  useEffect(() => {
    const a = document.activeElement;
    if (!a || a === document.body || !document.contains(a)) undoRef.current?.focus({ preventScroll: true });
  }, []);
  const node = (
    <div className="undo-toast" role="status">
      <span className="undo-toast-text">{t('saved.undoRemoved', { name: label })}</span>
      <Button ref={undoRef} size="sm" onClick={onUndo}>{t('saved.undo')}</Button>
      <IconButton label={t('a11y.close')} onClick={onClose}><CloseIcon size={16} /></IconButton>
    </div>
  );
  const slot = typeof document !== 'undefined' ? document.querySelector('.bottom-slot') : null;
  return slot ? createPortal(node, slot) : node;
}

/** The record map at device size: a real modal with a focus trap. */
export function RecordMapDialog({ title, onClose, children }) {
  const ref = useRef(null);
  useFocusTrap(ref, onClose);
  return (
    <div className="savedmap-full" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
      {children}
    </div>
  );
}

/**
 * A trip's price for its party, the figure the trip planner prints when the
 * trip is opened: the estimate, the figure and the party. Whole euros on a list, the estimate
 * mark whenever Carta priced any of it.
 */
export function TripPrice({ figure, className = '' }) {
  const { t } = useI18n();
  const ref = useRef(null);
  useSettledFigure(ref, figure ? Math.round(figure.total) : null);
  if (!figure) return null;
  return (
    <span className={`mt-price ${className}`.trim()} ref={ref}>
      <Money value={figure.total} est={figure.est} />
      <span className="mt-price-unit">
        {' '}{t(figure.party === 1 ? 'saved.forOne' : 'saved.forN', { n: figure.party })}
      </span>
    </span>
  );
}

/** How far off a trip is, from myTrips.whenParts(): "In 21 days", "Underway now". */
export function whenText(t, when) {
  if (!when) return '';
  return when.n == null ? t(when.key) : t(when.key, { n: when.n });
}

/** Initials in rings, the people on a trip; nothing when there is nobody. */
export function Faces({ people = [], max = 4 }) {
  if (!people.length) return null;
  const shown = people.slice(0, max);
  return (
    <span className="mt-faces" aria-hidden="true">
      {shown.map((p) => (
        <span className="mt-face" key={p.id || p.name} title={p.name}>{p.initials || <PersonIcon size={12} />}</span>
      ))}
      {people.length > shown.length && <span className="mt-face is-more">+{people.length - shown.length}</span>}
    </span>
  );
}

/**
 * Who came along, on a past trip: the names as faces and a line, and one
 * plus that opens a friend list and a name field. It writes the same
 * `extras.people` list the expense ledger splits by (tripCrew.js); appending
 * never renumbers it, and removal lives in the open list where the
 * consequence is visible.
 */
export function CrewBar({ crew, friends, onAdd, onRemove }) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const people = namedCrew(crew);
  const faces = crewInitials(crew, MAX_CREW).map((a) => ({ id: a.id, name: a.name, initials: a.initials }));
  const full = people.length >= MAX_CREW;
  const pickable = (friends || []).filter((f) => !crew.some((c) => c.userId === f.userId));
  const addTyped = () => {
    const name = typed.trim();
    if (!name) return;
    onAdd({ ...newCrewMember(), name });
    setTyped('');
  };
  return (
    <div className={`mt-crew${open ? ' is-open' : ''}`}>
      <div className="mt-crew-row">
        <Faces people={faces} />
        <span className="mt-crew-line">{people.length ? crewLabel(crew, lang, 3) : t('saved.crewEmpty')}</span>
        {!full && (
          <IconButton label={t('saved.crewAdd')} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            <PlusIcon size={16} />
          </IconButton>
        )}
      </div>
      {open && (
        <div className="mt-crew-pop">
          {pickable.length > 0 && (
            <div className="mt-crew-chips">
              {pickable.map((f) => (
                <Button
                  key={f.userId}
                  size="sm"
                  iconStart={<PlusIcon size={14} />}
                  onClick={() => onAdd({ ...newCrewMember(), name: f.displayName || f.handle, userId: f.userId })}
                >
                  {f.displayName || `@${f.handle}`}
                </Button>
              ))}
            </div>
          )}
          <form className="mt-crew-type" onSubmit={(e) => { e.preventDefault(); addTyped(); }}>
            <Field label={t('saved.crewName')} hideLabel value={typed} placeholder={t('saved.crewName')} onChange={(e) => setTyped(e.target.value)} />
            <Button size="sm" type="submit" disabled={!typed.trim()}>{t('saved.crewAddName')}</Button>
          </form>
          {people.length > 0 && (
            <ul className="mt-crew-list">
              {crew.map((c, i) => (c.name?.trim() ? (
                <li className="mt-crew-item" key={c.id}>
                  <span>{c.name.trim()}</span>
                  <IconButton label={t('saved.crewRemove', { name: c.name.trim() })} onClick={() => onRemove(i)}>
                    <CloseIcon size={14} />
                  </IconButton>
                </li>
              ) : null))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
