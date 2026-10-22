import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Chip, Field, IconButton } from '../components/ui/index.js';
import { CheckIcon, ChevronDownIcon, CloseIcon, FilterIcon, SearchIcon, SortIcon } from '../components/Icons.jsx';
import '../styles/78-filter-pane.css';
import '../styles/83-where-bar.css';

/*
 * The What and Where bar (T593, the owner's Komoot reference "Which sport?
 * Where? Search"): the first thing in an outdoor category tab's content.
 *
 *   What   one of the tab's own kinds, drawn from an existing facet group
 *          (a walk's highlights, a ride's bike, a beach's best use, a lake's
 *          doing, a mountain's kind). Held as a draft until Search, the way
 *          the reference does it; a chip changed elsewhere resets the draft.
 *   Where  the tab's own search text (DestinationsTab `query`), live as it
 *          always was: a town, a region or a country name narrows the list
 *          as it is typed. The suggestion list rides in as `children`.
 *   Search a secondary Button: it applies What and settles Where (a typed
 *          town becomes the place the list measures from). The view's one
 *          primary stays where it was.
 *
 * T600, compact: no band behind it. On a desktop one row, What, Where,
 * Search and the view pill (`after`); on a phone two, Where with the view
 * pill, then What with Search. What wears its label inside its box; Where is
 * a search box (the icon and the placeholder name it), its label kept for
 * assistive tech only.
 */
export function WhereBar({ t, what = null, where, onSearch, after = null, children = null }) {
  const [draft, setDraft] = useState(what?.value || '');
  const applied = what?.value || '';
  useEffect(() => { setDraft(applied); }, [applied]);
  const inputId = `wbar${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const inputRef = useRef(null);

  // A div, not a form: the suggestion list inside carries plain buttons,
  // and a form would turn each of them into a submit.
  const submit = () => onSearch?.(what ? draft : null);

  return (
    <div className={`wbar${what ? '' : ' is-whereonly'}${after ? ' has-view' : ''}`} role="search" aria-label={t('where.barAria')}>
      {what && (
        <Field
          as="select"
          className="wbar-what"
          label={t('where.what')}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        >
          <option value="">{t('where.any')}</option>
          {what.options.map((o) => (
            <option key={o.key} value={o.key} disabled={o.disabled}>{o.label}</option>
          ))}
        </Field>
      )}
      <div className="wbar-where">
        <label className="field-label sr-only" htmlFor={inputId}>{t('where.where')}</label>
        <div className="wbar-box" ref={where.boxRef}>
          <SearchIcon size={16} className="wbar-icon" />
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            className="wbar-input"
            value={where.value}
            onChange={where.onChange}
            onFocus={where.onFocus}
            onKeyDown={where.onKeyDown}
            placeholder={t('where.placeholder')}
            autoComplete="off"
            enterKeyHint="search"
          />
          {where.value && (
            <IconButton
              label={t('where.clear')}
              className="wbar-clear"
              onClick={() => { where.onClear?.(); inputRef.current?.focus(); }}
            >
              <CloseIcon size={14} />
            </IconButton>
          )}
          {where.extra}
          {children}
        </div>
      </div>
      <Button variant="secondary" className="wbar-go" onClick={submit} iconStart={<SearchIcon size={15} />}>
        {t('where.search')}
      </Button>
      {after}
    </div>
  );
}

/*
 * The quick filter row (T593, the owner's AllTrails reference): the tab's
 * most used facet groups as dropdown chips, each opening a small popover
 * with the group's existing choices, then "All filters" for the sheet.
 * Sits over the list and over the map alike.
 *
 * A group is the shape DestinationsTab's facetGroups already has:
 * { key, label, options: [{ key, label, on, disabled }], onToggle(key) }.
 * A chip reads as selected while any of its choices is on, and says which:
 * the one choice's own name, or the group's name with the count.
 *
 * The popover is the carta-design popover: --surface, --elev-2,
 * --radius-control, at most 320 px, never modal. Escape, a tap outside or
 * the chip again closes it, and Escape hands focus back to the chip.
 */
export function FilterChipBar({
  t, groups, onAll, allCount = 0, fmt = String,
  allOn = false, allControls = undefined, allRef = undefined, lead = null,
}) {
  const [openKey, setOpenKey] = useState(null);
  const [left, setLeft] = useState(0);
  const barRef = useRef(null);
  const popRef = useRef(null);
  const chipRefs = useRef(new Map());
  const popId = `qf${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const open = groups.find((g) => g.key === openKey) || null;

  // The popover hangs under its chip, kept inside the bar's width.
  useLayoutEffect(() => {
    if (!open) return;
    const bar = barRef.current;
    const chip = chipRefs.current.get(open.key);
    const pop = popRef.current;
    if (!bar || !chip || !pop) return;
    const b = bar.getBoundingClientRect();
    const c = chip.getBoundingClientRect();
    const w = pop.offsetWidth;
    setLeft(Math.max(0, Math.min(c.left - b.left, b.width - w)));
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (popRef.current?.contains(e.target)) return;
      if (chipRefs.current.get(open.key)?.contains(e.target)) return;
      setOpenKey(null);
    };
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      const chip = chipRefs.current.get(open.key);
      setOpenKey(null);
      chip?.focus();
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  // A group that vanished (the scope changed under it) closes its popover.
  useEffect(() => {
    if (openKey && !open) setOpenKey(null);
  }, [openKey, open]);

  if (!groups.length && !onAll) return null;

  const chipText = (g) => {
    const on = g.options.filter((o) => o.on);
    if (on.length === 1) return on[0].label;
    if (on.length > 1) return t('where.chipMany', { label: g.label, n: fmt(on.length) });
    return g.label;
  };

  return (
    <div className="qfbar" ref={barRef}>
      <div className="qfbar-row" role="group" aria-label={t('where.chipsAria')}>
        {onAll && (
          <Button
            ref={allRef}
            variant="secondary"
            size="sm"
            className={`qfbar-all${allOn ? ' is-on' : ''}`}
            iconStart={<FilterIcon size={15} />}
            onClick={() => { setOpenKey(null); onAll(); }}
            // T602: on a desktop All filters opens and closes the side pane
            // (allControls names it); on a phone it opens the sheet.
            aria-haspopup={allControls ? undefined : 'dialog'}
            aria-expanded={allOn}
            aria-controls={allControls}
          >
            {t('places.allFilters')}
            {allCount > 0 && <Chip kind="count" className="dtab-count">{fmt(allCount)}</Chip>}
          </Button>
        )}
        {lead}
        {groups.map((g) => {
          const isOpen = openKey === g.key;
          const on = g.options.some((o) => o.on);
          return (
            <Chip
              key={g.key}
              kind="filter"
              selected={on}
              className={`qfbar-chip${isOpen ? ' is-open' : ''}`}
              ref={(el) => { if (el) chipRefs.current.set(g.key, el); else chipRefs.current.delete(g.key); }}
              aria-pressed={undefined}
              aria-haspopup="true"
              aria-expanded={isOpen}
              aria-controls={isOpen ? popId : undefined}
              onClick={() => setOpenKey(isOpen ? null : g.key)}
            >
              {chipText(g)}
              <ChevronDownIcon size={14} className="qfbar-chev" />
            </Chip>
          );
        })}
      </div>
      {open && (
        <div className="qfbar-pop" id={popId} ref={popRef} role="group" aria-label={open.label} style={{ left }}>
          <p className="qfbar-pop-h">{open.label}</p>
          <div className="qfbar-pop-chips">
            {open.options.map((o) => (
              <Chip
                key={o.key}
                kind="filter"
                selected={!!o.on}
                disabled={o.disabled}
                className={o.cls || ''}
                onClick={() => open.onToggle(o.key)}
              >
                {o.label}
              </Chip>
            ))}
          </div>
          {open.options.some((o) => o.on) && (
            <Button
              variant="quiet"
              size="sm"
              className="qfbar-pop-clear"
              onClick={() => { for (const o of open.options) if (o.on) open.onToggle(o.key); }}
            >
              {t('where.clearGroup')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/*
 * T602: the Sort pill of the category tabs, the look of Places' toolbar
 * Sort (a secondary sm pill, a menu of radio items under it; the menu's
 * styles are .xsort-menu in 84-explore-overview.css). `options` are
 * { key, labelKey }, `value` the current key.
 */
export function SortPill({ t, options, value, onChange, className = '' }) {
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const id = `qs${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const cur = options.find((o) => o.key === value) || options[0];
  const open = pos != null;
  const close = useCallback((refocus) => {
    setPos(null);
    if (refocus) btnRef.current?.focus();
  }, []);
  const toggle = () => {
    if (open) { close(false); return; }
    const r = btnRef.current.getBoundingClientRect();
    const width = 220;
    setPos({
      top: Math.round(r.bottom + 4),
      left: Math.round(Math.max(16, Math.min(r.left, window.innerWidth - width - 16))),
    });
  };
  useEffect(() => {
    if (!open) return undefined;
    menuRef.current?.querySelector('[aria-checked="true"]')?.focus();
    const onDown = (e) => {
      if (menuRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return;
      close(false);
    };
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      close(true);
    };
    const onScroll = (e) => { if (!menuRef.current?.contains(e.target)) close(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, close]);
  if (!cur) return null;
  const onMenuKey = (e) => {
    const items = [...menuRef.current.querySelectorAll('[role="menuitemradio"]')];
    const i = items.indexOf(document.activeElement);
    let next = null;
    if (e.key === 'ArrowDown') next = items[(i + 1) % items.length];
    else if (e.key === 'ArrowUp') next = items[(i - 1 + items.length) % items.length];
    else if (e.key === 'Home') next = items[0];
    else if (e.key === 'End') next = items[items.length - 1];
    else if (e.key === 'Tab') { close(false); return; }
    if (next) { e.preventDefault(); next.focus(); }
  };
  return (
    <>
      <Button ref={btnRef} variant="secondary" size="sm" className={`qfbar-sort${open ? ' is-open' : ''} ${className}`.trim()}
        iconStart={<SortIcon size={15} />} aria-haspopup="menu" aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={`${t('places.sortLabel')}: ${t(cur.labelKey)}`}
        onClick={toggle}>
        {t('explore.toolSort')}
      </Button>
      {open && createPortal(
        <div className="xsort-menu" role="menu" id={id} ref={menuRef} aria-label={t('places.sortLabel')}
          style={{ top: pos.top, left: pos.left }} onKeyDown={onMenuKey}>
          {options.map((o) => {
            const on = o.key === cur.key;
            return (
              <Button key={o.key} variant="quiet" size="sm" role="menuitemradio" aria-checked={on}
                tabIndex={-1} className={`xsort-item${on ? ' is-on' : ''}`}
                iconEnd={on ? <CheckIcon size={16} /> : null}
                onClick={() => { onChange(o.key); close(true); }}>
                {t(o.labelKey)}
              </Button>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}
