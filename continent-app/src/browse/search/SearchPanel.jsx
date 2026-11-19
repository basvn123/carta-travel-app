import React from 'react';
import { countKey } from '../../lib/plural.js';
import { useI18n } from '../../i18n/index.jsx';
import { HouseIcon } from '../../components/HouseIcons.jsx';
import { Pressable } from '../../components/ui/Pressable.jsx';
import { useSettings } from '../../components/SettingsLine.jsx';
import { useIsDesktop } from '../../hooks/useIsDesktop.js';
import { countryName } from '../../lib/countryName.js';
import { loadSearchIndex } from '../../lib/searchIndex.js';
import {
  cartaPlaces, cartaRegionsFrom, extractTokens, hitsFor, loadAreas, loadTownsFor, prefetchFor, readRecent,
  addRecent, rememberPick, removeFeature, resolveIds, suggest, nearLabel, rememberLocalName,
} from '../../lib/search/index.js';
import { isQuestion } from '../searchDockStore.js';
import { openAskChat } from '../ask/askChatStore.js';
import '../../styles/82-search-panel.css';

const FEATURE_ICON = { beach: 'beaches', lake: 'lakes', hiking: 'trails', ski: 'mountains', oldtown: 'places', islands: 'water' };
const TYPE_ICON = { place: 'places', near: 'pin', region: 'map', country: 'from', ask: 'ask', text: 'search' };
// The Browse shortcuts' glyphs, by filtersStore id.
const SHORTCUT_ICON = { top: 'star', hiking: 'trails', oldtown: 'places', sea: 'beaches', island: 'water', lake: 'lakes', gems: 'signpost' };
const MAX_TOKENS_SHOWN = 2;

function Glyph({ name, size = 20 }) {
  const G = HouseIcon[name];
  return G ? <G size={size} /> : null;
}

/** Sets a React-controlled field's value as typing would, so the band's
 *  own state follows (the field belongs to the band). */
function setFieldValue(field, value) {
  if (!field) return;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (setter) setter.call(field, value); else field.value = value;
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * The search panel under Explore's search field (G12; round 2, decision.md
 * APPROVED 2026-11-19, sections 1 and 3). The band mounts it while the
 * field has focus.
 *
 *   Browse   the shortcuts (Top rated, Hiking bases, Old towns, By the sea,
 *            Islands, Lakes, Hidden gems) on Places, as the tab publishes
 *            them (filtersStore); each applies in place, stays lit while
 *            applied and takes itself off when picked again
 *   Recent   the last searches, before anything is typed
 *   Places   suggestions as you type: a name and its place (the country,
 *            a region and its country, "Country"), no counts (owner O4, O5)
 *   desktop  Places (or Recent) on the left, Browse on the right; a typed
 *            text ends the list with "Ask Carta about ..."
 *   phone    Browse, then Recent or Places; Filters and Ask Carta stand
 *            apart under a rule as two buttons, never rows in the list (O3)
 *
 * The field is the combobox (the band's); this panel holds its listbox and
 * drives `aria-activedescendant` and the arrow keys on it, so the band needs
 * no keyboard code of its own. The shortcuts are options too, so the arrow
 * keys reach every part from the field. A pick keeps today's flow: it runs
 * the band's search with the result's label, and lib/search/picked.js makes
 * the list show the places the label stands for.
 *
 * Props: query, kind ('places' | a layer), id (the field's aria-controls),
 * filters (useFilters() on Places, else null), onSubmit(text), onClose(),
 * onOpenFilters(opener), onAsk(opener, text), onPick(result) optional
 * (replaces onSubmit), inputRef optional (else the field is found by
 * aria-controls).
 */
export function SearchPanel({ query = '', kind = 'places', id, filters = null, onSubmit, onClose, onOpenFilters, onAsk, onPick, inputRef }) {
  const { t, lang } = useI18n();
  const isDesktop = useIsDesktop();
  const s = useSettings();
  const places = React.useMemo(() => cartaPlaces(s?.data), [s?.data]);
  const isPlaces = kind === 'places';
  const listId = `${id || 'search'}-list`;

  const [allTokens, setAllTokens] = React.useState(false);
  const [towns, setTowns] = React.useState([]);
  const [areas, setAreas] = React.useState(null);
  const [cartaRegions, setCartaRegions] = React.useState([]);
  const [recent, setRecent] = React.useState(() => readRecent());
  const [active, setActive] = React.useState(-1);
  const typed = query.trim();

  React.useEffect(() => {
    let live = true;
    prefetchFor('');
    loadAreas().then((a) => { if (live) setAreas(a); });
    loadSearchIndex().then((ix) => { if (live) setCartaRegions(cartaRegionsFrom(ix)); });
    return () => { live = false; };
  }, []);

  // A question goes to Ask: no feature tokens above it (flow-C m5).
  const question = isQuestion(typed);
  const { rest } = extractTokens(typed);
  React.useEffect(() => {
    if (typed.length === 1) prefetchFor(typed);
  }, [typed]);
  // Towns for the text without feature words and for the whole text, so a
  // name holding a feature word ("Lake District") is still found.
  React.useEffect(() => {
    let live = true;
    Promise.all([loadTownsFor(rest), rest === typed ? [] : loadTownsFor(typed)]).then(([a, b]) => {
      if (!live) return;
      if (!b.length) { setTowns(a); return; }
      const seen = new Set(a.map((x) => x.gid));
      setTowns([...a, ...b.filter((x) => !seen.has(x.gid))]);
    });
    return () => { live = false; };
  }, [rest, typed]);

  const result = React.useMemo(
    () => suggest(typed, { places, towns, areas, cartaRegions, lang, noTokens: question }),
    [typed, places, towns, areas, cartaRegions, lang, question],
  );

  const featureName = (k) => t(`search.feature.${k}`);
  const labelOf = (it) => {
    if (it.type === 'browse') return it.name;
    const fx = (it.tokens || []).map(featureName).join(', ');
    if (it.type === 'feature') return fx;
    // A region carries its country, so the region Porto and the place
    // Porto never share a label (picked.js keys on it, flow-C M1).
    const base = it.type === 'near' ? nearLabel(t, lang, it.name)
      : it.type === 'region' && it.cc ? `${it.name}, ${countryName(it.cc, '', lang)}` : it.name;
    if (!fx || it.type === 'place') return base;
    return it.type === 'near' ? nearLabel(t, lang, it.name, fx) : t('search.featuresIn', { features: fx, place: it.name });
  };
  // The second line says where a suggestion is, nothing else: no counts, no
  // "in Carta", no "not covered yet" (owner O4, O5).
  const subOf = (it) => {
    const country = it.cc ? countryName(it.cc, '', lang) : '';
    if (it.type === 'place' || it.type === 'near') return country;
    if (it.type === 'region') return country ? t('search.subRegion', { country }) : t('search.subRegionAny');
    if (it.type === 'country') return t('search.subCountry');
    if (it.type === 'feature') return t('search.subFeature');
    if (it.type === 'ask') return t('search.askSub');
    return '';
  };

  const typing = typed.length > 0;
  // Browse needs the tab that applies it (Places publishes its shortcuts,
  // with the label an applied chip wears too).
  const browse = isPlaces && filters?.shortcuts?.length
    ? filters.shortcuts.map((b) => ({ type: 'browse', key: `b:${b.id}`, shortcut: b.id, on: !!b.on, icon: SHORTCUT_ICON[b.id] || 'star', name: b.label }))
    : [];
  // A phone asks from its own button group under the list (O3).
  const askItem = typing && isDesktop ? { type: 'ask', key: 'ask', name: t('search.askAbout', { q: typed }) } : null;
  const placeItems = typing ? result.items : recent;
  // DOM order is the arrow keys' order: the reading order of each layout.
  const options = isDesktop
    ? [...placeItems, ...(askItem ? [askItem] : []), ...browse]
    : [...browse, ...placeItems];
  const indexOf = new Map(options.map((it, i) => [it.key, i]));
  const optId = (i) => `${listId}-o${i}`;

  React.useEffect(() => { setActive(-1); }, [typed]);
  React.useEffect(() => { setAllTokens(false); }, [typing]);

  const fieldOf = React.useCallback(() => inputRef?.current
    || (typeof document !== 'undefined' && id ? document.querySelector(`[aria-controls="${id}"], [aria-controls="${listId}"]`) : null),
  [inputRef, id, listId]);
  // Ask closes back to the band's Ask button: the field would open this
  // panel again on focus.
  const askDoor = () => (typeof document !== 'undefined' ? document.querySelector('.band-ask') : null);
  const askAbout = React.useCallback((text) => {
    if (onAsk) onAsk(askDoor(), text);
    else { openAskChat(askDoor(), text ? { text } : null); onClose?.(); }
  }, [onAsk, onClose]);

  const pick = React.useCallback((it) => {
    if (!it) return;
    if (it.type === 'ask') { askAbout(typed); return; }
    // A recent search sent as typed words searches those words again.
    if (it.type === 'text') { setRecent(addRecent(it)); onSubmit?.(it.name); return; }
    if (it.type === 'browse') {
      filters?.applyShortcut(it.shortcut, !it.on);
      onClose?.();
      return;
    }
    const label = labelOf(it);
    setRecent(addRecent(it));
    if (!isPlaces) {
      // The layer tabs find a place by name themselves (DestinationsTab).
      onSubmit?.(it.type === 'feature' ? typed : it.name);
      return;
    }
    const ids = resolveIds(it, places);
    // The list row this opens says the name the traveller picked (Florenz).
    if (it.type === 'place') rememberLocalName(it.id, lang, it.name);
    rememberPick(label, hitsFor({ ...it, name: label }, ids));
    if (onPick) onPick({ ...it, query: label, ids });
    else onSubmit?.(label);
    // labelOf reads t; it is rebuilt with the panel, as is this callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askAbout, filters, typed, isPlaces, places, lang, onPick, onSubmit, onClose]);

  // The combobox's keys live on the band's field; this panel owns the list.
  const optionsRef = React.useRef(options);
  optionsRef.current = options;
  const activeRef = React.useRef(active);
  activeRef.current = active;
  React.useEffect(() => {
    const field = fieldOf();
    if (!field) return undefined;
    const onKey = (e) => {
      const n = optionsRef.current.length;
      if (!n) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((i) => (i + 1) % n);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((i) => (i <= 0 ? n - 1 : i - 1));
      } else if (e.key === 'Enter' && activeRef.current >= 0) {
        // An active option wins over the form's own submit.
        e.preventDefault();
        pick(optionsRef.current[activeRef.current]);
      }
    };
    field.addEventListener('keydown', onKey);
    return () => field.removeEventListener('keydown', onKey);
  }, [fieldOf, pick]);
  React.useEffect(() => {
    const field = fieldOf();
    if (!field) return undefined;
    field.setAttribute('aria-autocomplete', 'list');
    if (active >= 0) field.setAttribute('aria-activedescendant', optId(active));
    else field.removeAttribute('aria-activedescendant');
    if (active >= 0) document.getElementById(optId(active))?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    return () => field.removeAttribute('aria-activedescendant');
    // optId is derived from listId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, fieldOf, listId]);

  const optionProps = (it) => {
    const i = indexOf.get(it.key);
    return {
      id: optId(i),
      role: 'option',
      'aria-selected': i === active,
      onMouseDown: (e) => e.preventDefault(),
      onMouseMove: () => { if (activeRef.current !== i) setActive(i); },
      onClick: () => pick(it),
    };
  };

  const option = (it) => {
    const icon = it.type === 'feature' ? FEATURE_ICON[it.tokens?.[0]] || 'search' : TYPE_ICON[it.type] || 'pin';
    const tokens = it.type !== 'place' && it.type !== 'feature' ? it.tokens || [] : [];
    const sub = subOf(it);
    const p = optionProps(it);
    return (
      <div key={it.key} {...p} className={`sp-opt${p['aria-selected'] ? ' is-active' : ''}`}>
        <span className="sp-opt-ic" aria-hidden="true"><Glyph name={icon} /></span>
        <span className="sp-opt-text">
          <span className="sp-opt-name">
            {tokens.map((k) => <span key={k} className="sp-tok-mark">{featureName(k)}</span>)}
            {/* With tokens the marks say the features, so the words carry only the place. */}
            {tokens.length ? (it.type === 'near' ? nearLabel(t, lang, it.name) : it.name) : labelOf(it)}
          </span>
          {sub && <span className="sp-opt-sub">{sub}</span>}
        </span>
      </div>
    );
  };

  const chip = (it) => {
    const p = optionProps(it);
    const on = it.on;
    return (
      <div key={it.key} {...p} className={`sp-chip${p['aria-selected'] ? ' is-active' : ''}${on ? ' is-on' : ''}`}>
        <span className="sp-chip-ic" aria-hidden="true"><Glyph name={it.icon} size={18} /></span>
        <span>{it.name}</span>
        {on && <span className="sr-only">{`, ${t('search.browseOn')}`}</span>}
      </div>
    );
  };

  const tokens = typing && !question ? result.tokens : [];
  const shown = allTokens ? tokens : tokens.slice(0, MAX_TOKENS_SHOWN);
  const tokenRow = tokens.length > 0 && (
    <div className="sp-tokens" role="group" aria-label={t('search.tokensAria')}>
      {shown.map((k) => (
        <span key={k} className="sp-tok">
          <span className="sp-tok-word">{featureName(k)}</span>
          <Pressable className="sp-tok-x" aria-label={t('search.tokenRemove', { word: featureName(k) })}
            onClick={() => {
              // The word leaves the field, and focus stays in it (Q6).
              const field = fieldOf();
              setFieldValue(field, removeFeature(query, k));
              field?.focus();
            }}>
            <HouseIcon.close size={16} />
          </Pressable>
        </span>
      ))}
      {tokens.length > shown.length && (
        <Pressable className="sp-tok-more" aria-label={t('search.moreTokensAria', { n: tokens.length - shown.length })}
          onClick={() => setAllTokens(true)}>
          {t('search.moreTokens', { n: tokens.length - shown.length })}
        </Pressable>
      )}
    </div>
  );

  const group = (key, head, children, className = '') => (
    <div role="group" aria-labelledby={`${listId}-${key}`} className={`sp-group ${className}`.trim()}>
      <div className="sp-head" id={`${listId}-${key}`} role="presentation">{head}</div>
      {children}
    </div>
  );
  const placesGroup = placeItems.length > 0
    && group('g1', typing ? t('search.groupPlaces') : t('search.recent'), placeItems.map(option));
  const askGroup = askItem && group('g2', t('search.groupAsk'), option(askItem));
  const browseGroup = browse.length > 0
    && group('g3', t('search.browse'), <div className="sp-chips" role="presentation">{browse.map(chip)}</div>, 'sp-browse');
  const left = placesGroup || askGroup;

  const filterCount = filters?.count || 0;
  // O3: on a phone Filters and Ask Carta are a group of their own, apart
  // from the suggestions, as buttons.
  const actions = !isDesktop && (
    <div className="sp-actions" role="group" aria-label={t('search.moreWays')}>
      {isPlaces && filters && (
        <Pressable className="sp-action" aria-label={filterCount ? t(countKey(lang, filterCount, 'band.filtersOnOne', 'band.filtersOn'), { n: filterCount }) : t('band.filters')}
          onClick={() => onOpenFilters?.(null)}>
          <HouseIcon.filter size={20} />
          <span className="sp-action-word" aria-hidden="true">{t('band.filters')}</span>
          {filterCount > 0 && <span className="band-count" aria-hidden="true">{filterCount}</span>}
        </Pressable>
      )}
      <Pressable className="sp-action sp-action--ask" aria-haspopup="dialog" onClick={() => askAbout(typing ? typed : '')}>
        <HouseIcon.ask size={20} />
        <span className="sp-action-word">{typing ? t('search.askAbout', { q: typed }) : t('dock.ask')}</span>
      </Pressable>
    </div>
  );

  const status = typing
    ? t(options.length === 1 ? 'search.oneSuggestion' : 'search.nSuggestions', { n: options.length })
    : '';
  // Nothing to offer yet (a desktop layer tab, no recent search): no empty box.
  if (!options.length && !tokenRow && !actions) return null;

  return (
    <div className={`sp${typing ? ' is-typing' : ' is-empty'}${isDesktop ? ' is-desk' : ' is-phone'}${left && browseGroup ? ' is-two' : ''}`}>
      <p className="sr-only" role="status" aria-live="polite">{status}</p>
      {tokenRow}
      <div role="listbox" id={listId} aria-label={t('search.listAria')} className="sp-list"
        hidden={options.length === 0}>
        {isDesktop ? (
          <>
            {left && <div className="sp-col" role="presentation">{placesGroup}{askGroup}</div>}
            {browseGroup && <div className="sp-col sp-col--side" role="presentation">{browseGroup}</div>}
          </>
        ) : (
          <>
            {browseGroup}
            {placesGroup}
          </>
        )}
      </div>
      {actions}
    </div>
  );
}
