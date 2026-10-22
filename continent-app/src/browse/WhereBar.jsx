import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Button, Chip, Field, IconButton } from '../components/ui/index.js';
import { ChevronDownIcon, CloseIcon, FilterIcon, SearchIcon } from '../components/Icons.jsx';
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
 * On a surface band (--surface, --radius-card, --border, no shadow). On a
 * phone the two fields stack and the button takes the full width.
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
    <div className={`wbar${what ? '' : ' is-whereonly'}`} role="search" aria-label={t('where.barAria')}>
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
        <label className="field-label" htmlFor={inputId}>{t('where.where')}</label>
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
export function FilterChipBar({ t, groups, onAll, allCount = 0, fmt = String }) {
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
            variant="secondary"
            size="sm"
            className="qfbar-all"
            iconStart={<FilterIcon size={15} />}
            onClick={() => { setOpenKey(null); onAll(); }}
            aria-haspopup="dialog"
          >
            {t('places.allFilters')}
            {allCount > 0 && <Chip kind="count" className="dtab-count">{fmt(allCount)}</Chip>}
          </Button>
        )}
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
