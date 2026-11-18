import React from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { HeartIcon } from '../../components/Icons.jsx';
import { HouseIcon } from '../../components/HouseIcons.jsx';
import { Pressable } from '../../components/ui/Pressable.jsx';
import { useSettings } from '../../components/SettingsLine.jsx';
import { countryName } from '../../lib/countryName.js';
import { loadSearchIndex } from '../../lib/searchIndex.js';
import { settingsSummary } from '../../lib/settings/index.js';
import {
  cartaPlaces, cartaRegionsFrom, extractTokens, hitsFor, loadAreas, loadTownsFor, prefetchFor, readRecent,
  addRecent, rememberPick, removeFeature, resolveIds, suggest,
} from '../../lib/search/index.js';
import { isQuestion } from '../searchDockStore.js';
import { openAskChat } from '../ask/askChatStore.js';
import { openSettings, settingsSheetState } from '../settings/settingsSheetStore.js';
import { openStudio } from '../styles/studioDoors.js';
import '../../styles/82-search-panel.css';

// lib/settings/summary.js names a few glyphs by what they show; the house
// set draws them under its own names (the band does the same).
const ALIAS = { plane: 'flight', flag: 'from' };
const FEATURE_ICON = { beach: 'beaches', lake: 'lakes', hiking: 'trails', ski: 'mountains', oldtown: 'places', islands: 'water' };
const TYPE_ICON = { place: 'places', near: 'pin', region: 'map', country: 'from', ask: 'ask' };
const MAX_TOKENS_SHOWN = 2;

function Glyph({ name, size = 20 }) {
  if (name === 'heart') return <HeartIcon size={size} />;
  const G = HouseIcon[ALIAS[name] || name];
  return G ? <G size={size} /> : null;
}

/** The settings items, or none while the engine is missing or throws:
 *  the search must work without them. */
function useSummary(t) {
  const s = useSettings();
  const style = s?.travelStyles?.active || null;
  return React.useMemo(() => {
    if (!s) return [];
    try {
      const out = settingsSummary(s.model ?? s, style, t, { data: s.data || null });
      return Array.isArray(out) ? out.filter((it) => it?.text) : [];
    } catch {
      return [];
    }
  }, [s, style, t]);
}

/** Sets a React-controlled field's value as typing would, so the band's
 *  own state follows (the field belongs to Lane 1's band). */
function setFieldValue(field, value) {
  if (!field) return;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (setter) setter.call(field, value); else field.value = value;
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Back to the search once Settings or the Style Studio closes, so Change
 *  "opens that step and returns" (decision.md APPROVED). Both live outside
 *  this panel, which closes while they are open, so this watches from
 *  outside React and gives up after ten minutes. */
function returnAfterClose(input, isOpen) {
  if (!input) return;
  const started = Date.now();
  let seenOpen = false;
  const timer = setInterval(() => {
    const open = isOpen();
    if (open) seenOpen = true;
    if ((seenOpen && !open) || Date.now() - started > 600000) {
      clearInterval(timer);
      if (seenOpen && !open && input.isConnected) input.focus();
    }
  }, 200);
}

/**
 * The search panel under Explore's search field (G12, decision.md 3 and the
 * APPROVED block). Lane 1's band mounts it while the field has focus.
 *
 *   empty    "You search as": the style and the four settings, each with
 *            Change, then Recent searches
 *   typing   the settings in one line with Change (phone; a desktop keeps the
 *            rows beside the suggestions), feature tokens, then suggestions
 *            in two groups, Places and Ask
 *
 * The field is the combobox (Lane 1); this panel holds its listbox and
 * drives `aria-activedescendant` and the arrow keys on it, so the band needs
 * no keyboard code of its own. A pick keeps today's flow: it runs the band's
 * search with the result's label, and lib/search/picked.js makes the list
 * show the places the label stands for.
 *
 * Props: query, kind ('places' | a layer), id (the field's aria-controls),
 * onSubmit(text), onClose(), onPick(result) optional (replaces onSubmit),
 * inputRef optional (else the field is found by aria-controls).
 */
export function SearchPanel({ query = '', kind = 'places', id, onSubmit, onClose, onPick, inputRef }) {
  const { t, lang } = useI18n();
  const s = useSettings();
  const places = React.useMemo(() => cartaPlaces(s?.data), [s?.data]);
  const summary = useSummary(t);
  const isPlaces = kind === 'places';
  const showSettings = isPlaces && summary.length > 0;
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
    const fx = (it.tokens || []).map(featureName).join(', ');
    if (it.type === 'feature') return fx;
    // A region carries its country, so the region Porto and the place
    // Porto never share a label (picked.js keys on it, flow-C M1).
    const base = it.type === 'near' ? t('search.near', { place: it.name })
      : it.type === 'region' && it.cc ? `${it.name}, ${countryName(it.cc, '', lang)}` : it.name;
    if (!fx || it.type === 'place') return base;
    return t(it.type === 'near' ? 'search.featuresNear' : 'search.featuresIn', { features: fx, place: it.name });
  };
  const subOf = (it) => {
    const country = it.cc ? countryName(it.cc, '', lang) : '';
    if (it.type === 'place') return country ? t('search.subPlace', { country }) : t('search.subPlaceAny');
    if (it.type === 'near') return t('search.subNear', { country });
    if (it.type === 'region') return country ? t('search.subRegion', { country }) : t('search.subRegionAny');
    if (it.type === 'country') return t('search.subCountry');
    if (it.type === 'feature') return t('search.subFeature');
    if (it.type === 'ask') return t('search.askSub');
    return '';
  };
  const countOf = (it) => (typeof it.count === 'number' && it.type !== 'place'
    ? t(it.count === 1 ? 'search.onePlace' : 'search.nPlaces', { n: it.count })
    : '');

  const typing = typed.length > 0;
  const askItem = typing ? { type: 'ask', key: 'ask', name: t('search.askAbout', { q: typed }) } : null;
  const placeItems = typing ? result.items : recent;
  const options = [...placeItems, ...(askItem ? [askItem] : [])];
  const optId = (i) => `${listId}-o${i}`;

  React.useEffect(() => { setActive(-1); }, [typed]);
  React.useEffect(() => { setAllTokens(false); }, [typing]);

  const fieldOf = React.useCallback(() => inputRef?.current
    || (typeof document !== 'undefined' && id ? document.querySelector(`[aria-controls="${id}"], [aria-controls="${listId}"]`) : null),
  [inputRef, id, listId]);

  const pick = React.useCallback((it) => {
    if (!it) return;
    const field = fieldOf();
    if (it.type === 'ask') {
      openAskChat(field, { text: typed });
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
    rememberPick(label, hitsFor({ ...it, name: label }, ids));
    if (onPick) onPick({ ...it, query: label, ids });
    else onSubmit?.(label);
    // labelOf reads t; it is rebuilt with the panel, as is this callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldOf, typed, isPlaces, places, onPick, onSubmit, onClose]);

  // The combobox's keys live on Lane 1's field; this panel owns the list.
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
    if (active >= 0) document.getElementById(optId(active))?.scrollIntoView?.({ block: 'nearest' });
    return () => field.removeAttribute('aria-activedescendant');
    // optId is derived from listId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, fieldOf, listId]);

  const change = (it) => {
    const field = fieldOf();
    if (it.step === 'style' || it.key === 'style') {
      openStudio(s?.travelStyles);
      returnAfterClose(field, () => !!document.querySelector('.sst-status'));
    } else {
      openSettings({ step: it.step || 'overview' });
      returnAfterClose(field, () => settingsSheetState().isOpen);
    }
  };

  const option = (it, i) => {
    const icon = it.type === 'feature' ? FEATURE_ICON[it.tokens?.[0]] || 'search' : TYPE_ICON[it.type] || 'pin';
    const count = countOf(it);
    const tokens = it.type !== 'place' && it.type !== 'feature' ? it.tokens || [] : [];
    return (
      <div key={it.key} id={optId(i)} role="option" aria-selected={i === active}
        className={`sp-opt${i === active ? ' is-active' : ''}`}
        onMouseDown={(e) => e.preventDefault()}
        onMouseMove={() => { if (activeRef.current !== i) setActive(i); }}
        onClick={() => pick(it)}>
        <span className="sp-opt-ic" aria-hidden="true"><Glyph name={icon} /></span>
        <span className="sp-opt-text">
          <span className="sp-opt-name">
            {tokens.map((k) => <span key={k} className="sp-tok-mark">{featureName(k)}</span>)}
            {/* With tokens the marks say the features, so the words carry only the place. */}
            {tokens.length ? (it.type === 'near' ? t('search.near', { place: it.name }) : it.name) : labelOf(it)}
          </span>
          <span className="sp-opt-sub">{subOf(it)}</span>
        </span>
        {count && <span className="sp-opt-count">{count}</span>}
      </div>
    );
  };

  const rows = showSettings && (
    <section className="sp-as" aria-labelledby={`${listId}-as`}>
      <h3 className="sp-head" id={`${listId}-as`}>{t('search.youSearchAs')}</h3>
      <ul className="sp-rows">
        {summary.map((it) => (
          <li key={it.key} className={`sp-row${it.key === 'style' ? ' is-style' : ''}`}>
            <span className="sp-row-ic" aria-hidden="true"><Glyph name={it.icon} /></span>
            <span className="sp-row-text">{it.text}</span>
            <Pressable className="sp-change" aria-label={t('search.changeAria', { what: it.text })}
              onClick={() => change(it)}>
              {t('search.change')}
            </Pressable>
          </li>
        ))}
      </ul>
    </section>
  );

  const line = showSettings && typing && (
    <div className="sp-line">
      <span className="sp-line-items" aria-label={t('search.summaryAria', { text: summary.map((x) => x.text).join(', ') })} role="note">
        {summary.map((it) => (
          <span key={it.key} className="sp-line-item" aria-hidden="true">
            <Glyph name={it.icon} size={16} />
            <span>{it.text}</span>
          </span>
        ))}
      </span>
      <Pressable className="sp-change" aria-label={t('search.changeAria', { what: t('search.youSearchAs') })}
        onClick={() => change({ step: 'overview' })}>
        {t('search.change')}
      </Pressable>
    </div>
  );

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

  const nPlaces = placeItems.length;
  const status = typing
    ? t(options.length === 1 ? 'search.oneSuggestion' : 'search.nSuggestions', { n: options.length })
    : '';

  return (
    <div className={`sp${typing ? ' is-typing' : ' is-empty'}${showSettings ? ' has-settings' : ''}${options.length ? ' has-list' : ''}`}>
      <p className="sr-only" role="status" aria-live="polite">{status}</p>
      <div className="sp-main">
        {line}
        {tokenRow}
        <div role="listbox" id={listId} aria-label={t('search.listAria')} className="sp-list"
          hidden={options.length === 0}>
          {nPlaces > 0 && (
            <div role="group" aria-labelledby={`${listId}-g1`}>
              <div className="sp-head" id={`${listId}-g1`} role="presentation">
                {typing ? t('search.groupPlaces') : t('search.recent')}
              </div>
              {placeItems.map((it, i) => option(it, i))}
            </div>
          )}
          {askItem && (
            <div role="group" aria-labelledby={`${listId}-g2`}>
              <div className="sp-head" id={`${listId}-g2`} role="presentation">{t('search.groupAsk')}</div>
              {option(askItem, nPlaces)}
            </div>
          )}
        </div>
      </div>
      {rows}
    </div>
  );
}
