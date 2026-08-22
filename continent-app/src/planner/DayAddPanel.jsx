import React, { useMemo, useState } from 'react';
import { PoiThumb } from './DayActivityRows.jsx';
import { isMustSee, poiKind, poiMapCat, poiCategory, poiRating } from './dayDraft.js';
import { useI18n } from '../i18n/index.jsx';
import { safeUrl } from '../lib/format.js';
import {
  SearchIcon, PlusIcon, CheckIcon, StarIcon, SparkIcon, RouteIcon,
  MapPinIcon, MountainIcon, InfoIcon,
} from '../components/Icons.jsx';

// The picks the traveller actually thinks in. Deliberately five: a sixth chip
// (food) turned the row into a scroller and buried "top rated", which is the
// one filter that reliably shortens a 400-place town.
const PICKS = [
  { key: 'all', labelKey: 'dayws.pickAll' },
  { key: 'sight', labelKey: 'dayws.pickSights' },
  { key: 'nature', labelKey: 'dayws.pickNature' },
  { key: 'active', labelKey: 'dayws.pickActive' },
  { key: 'top', labelKey: 'dayws.pickTop' },
];

const PAGE = 12;

/** The sentence a card gets to say what a place is. The catalogue description
 *  when there is one, trimmed on a word boundary; otherwise the honest short
 *  version, which is its kind and whether it is one of the town's best. */
export function placeBlurb(item, t) {
  const desc = (item.desc || '').trim();
  if (desc) {
    // "Church in Austria" is technically a description and tells a traveller
    // nothing. When the catalogue line is that thin, say what else is known.
    if (desc.length < 45) {
      const extra = isMustSee(item)
        ? t('dayws.blurbAddMust')
        : poiRating(item).tier >= 2 ? t('dayws.blurbAddTop') : '';
      const stopped = /[.!?]$/.test(desc) ? desc : `${desc}.`;
      return extra ? `${stopped} ${extra}` : stopped;
    }
    if (desc.length <= 150) return desc;
    const cut = desc.slice(0, 150);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
    if (end > 80) return cut.slice(0, end + 1);
    const space = cut.lastIndexOf(' ');
    return `${cut.slice(0, space > 0 ? space : 150).replace(/[,;:]$/, '')}...`;
  }
  // poiKind is capitalised for a badge ("Castle"); mid-sentence it is not.
  const kind = (poiKind(item) || 'place').toLowerCase();
  if (isMustSee(item)) return t('dayws.blurbMust', { kind });
  if (poiRating(item).tier >= 2) return t('dayws.blurbTop', { kind });
  return t('dayws.blurbPlain', { kind });
}

/** A browsable place: photo, what it is, why it is worth the walk, one add. */
function PlaceCard({ item, idx, added, focused, note, onToggle, onFocus, t }) {
  const wiki = safeUrl(item.wiki);
  return (
    <div className={`daya-card${added ? ' added' : ''}${focused ? ' focused' : ''}`}>
      <button
        className="daya-card-main"
        onClick={() => onFocus(item, idx)}
        title={t('dayws.showOnMap')}
      >
        <span className="daya-shot">
          <PoiThumb img={item.img} cat={poiMapCat(item)} name={item.name} />
        </span>
        <span className="daya-text">
          <span className="daya-name">
            {item.name}
            {isMustSee(item) && (
              <span className="daya-must"><StarIcon size={9} /> {t('dayws.mustBadge')}</span>
            )}
          </span>
          <span className="daya-kind">
            {poiKind(item)}
            {item.custom && (
              <span className="day-badge-custom">
                {item.unmapped ? t('dayws.customApprox') : t('dayws.custom')}
              </span>
            )}
          </span>
          <span className="daya-blurb">{placeBlurb(item, t)}</span>
          {note && <span className="daya-note">{note}</span>}
        </span>
      </button>
      <div className="daya-card-foot">
        {wiki && (
          <a className="daya-more" href={wiki} target="_blank" rel="noreferrer">
            <InfoIcon size={11} /> {t('dayws.readMore')}
          </a>
        )}
        <button
          className={`daya-add${added ? ' on' : ''}`}
          onClick={() => onToggle(idx)}
          aria-pressed={added}
          title={added ? t('dayws.removeFromDay') : t('dayws.addToDay')}
        >
          {added ? <><CheckIcon size={12} /> {t('dayws.added')}</> : <><PlusIcon size={12} /> {t('dayws.add')}</>}
        </button>
      </div>
    </div>
  );
}

/** One ready-made day: what it is built around, how long it runs, and the
 *  first places it visits, so the choice is made on evidence and not on a
 *  title. Applying it replaces nothing quietly: the caller confirms. */
function ReadyCard({ route, highlight, onUse, t }) {
  const names = route.stops.slice(0, 4).map((s) => s.item.name);
  return (
    <div className={`daya-ready${highlight ? ' rec' : ''}`}>
      <div className="daya-ready-head">
        <span className="daya-ready-title">{route.title}</span>
        {route.recommended && <span className="daya-ready-tag">{t('dayws.readyMatch')}</span>}
      </div>
      <p className="daya-ready-desc">{route.desc}</p>
      <div className="daya-ready-stats">
        <span>{t('dayws.stopsN', { n: route.stops.length })}</span>
        <span className="daya-sep" aria-hidden="true" />
        <span>{t('dayws.readyKm', { km: route.km.toFixed(1) })}</span>
        <span className="daya-sep" aria-hidden="true" />
        <span>{t('dayws.readyHours', { h: (route.totalMin / 60).toFixed(1) })}</span>
      </div>
      <p className="daya-ready-names">{names.join(', ')}{route.stops.length > names.length ? `, ${t('day.plusNMore', { n: route.stops.length - names.length })}` : ''}</p>
      <button className="daya-ready-use" onClick={() => onUse(route)}>
        <RouteIcon size={13} /> {t('dayws.readyUse')}
      </button>
    </div>
  );
}

/**
 * Tab 2 of the day workspace: everything you could still add to today.
 *
 * Two sub-tabs, because there are two different questions. "Ready-made" is for
 * a traveller who wants a good day handed to them: whole routes, already
 * ordered, from the same rating signal the map pins use. "Custom" is for one
 * who knows what they are looking for: search anything (the catalogue is a head
 * start, not a gate: a place it has never heard of still becomes a stop), then
 * browse by pick. Tapping any card moves the map to it, so how far it sits from
 * today's route is a fact you can see rather than guess.
 */
export function DayAddPanel({
  city, deck, farDeck, assignedIdx, onToggle, onFocus, focusedIdx,
  query, onQuery, searchResults, onAddCustom, customBusy,
  routes, citytrip, onUseCitytrip, onUseRoute, onAskCarta,
  suggestions = [], limited = false,
  mode, onMode, pick, onPick,
}) {
  const { t } = useI18n();
  // mode (ready / custom) and pick live in the parent: switching to the plan
  // and back must not drop a traveller who was three filters deep in the
  // catalogue back onto the ready-made list.
  const setMode = onMode;
  const setPick = onPick;
  const [shown, setShown] = useState(PAGE);

  // The suggestions block sits above the deck and is drawn FROM the deck, so
  // without this a place Carta is actively recommending is also listed twice
  // on the same screen.
  const suggShown = pick === 'all' && suggestions.length > 0;
  const suggIdx = useMemo(() => new Set(suggestions.map((x) => x.idx)), [suggestions]);
  const filtered = useMemo(() => deck.filter(({ item, idx }) => {
    if (suggShown && suggIdx.has(idx)) return false;
    if (pick === 'all') return true;
    if (pick === 'top') return isMustSee(item) || poiRating(item).tier >= 2;
    return poiCategory(item) === pick;
  }), [deck, pick, suggShown, suggIdx]);

  const searching = query.trim().length >= 2;
  const exactHit = searchResults.some(({ item }) => item.name.trim().toLowerCase() === query.trim().toLowerCase());

  const hasReady = !!citytrip || routes.length > 0;

  return (
    <div className="daya">
      <div className="daya-modes" role="tablist" aria-label={t('dayws.addAria')}>
        <button
          role="tab"
          aria-selected={mode === 'ready'}
          className={`daya-mode${mode === 'ready' ? ' on' : ''}`}
          onClick={() => setMode('ready')}
        >{t('dayws.modeReady')}</button>
        <button
          role="tab"
          aria-selected={mode === 'custom'}
          className={`daya-mode${mode === 'custom' ? ' on' : ''}`}
          onClick={() => setMode('custom')}
        >{t('dayws.modeCustom')}</button>
      </div>

      {mode === 'ready' && (
        <div className="daya-ready-list">
          <p className="daya-lead">{t('dayws.readyLead', { city: city || t('day.thisCity') })}</p>
          {citytrip && (
            <div className="daya-ready rec">
              <div className="daya-ready-head">
                <span className="daya-ready-title">{t('dayws.citytripTitle', { city: city || '' })}</span>
                <span className="daya-ready-tag">{t('dayws.readyWalk')}</span>
              </div>
              <p className="daya-ready-desc">{t('dayws.citytripDesc')}</p>
              <div className="daya-ready-stats">
                <span>{t('dayws.stopsN', { n: citytrip.n_stops })}</span>
                <span className="daya-sep" aria-hidden="true" />
                <span>{t('dayws.readyKm', { km: (citytrip.distance_m / 1000).toFixed(1) })}</span>
              </div>
              <button className="daya-ready-use" onClick={onUseCitytrip}>
                <RouteIcon size={13} /> {t('dayws.readyUse')}
              </button>
            </div>
          )}
          {routes.map((r, i) => (
            <ReadyCard
              key={r.key}
              route={r}
              highlight={!citytrip && i === 0}
              onUse={onUseRoute}
              t={t}
            />
          ))}
          {!hasReady && <p className="daya-empty">{t('dayws.readyNone')}</p>}
          <button className="daya-ask" onClick={onAskCarta}>
            <SparkIcon size={14} />
            <span><b>{t('dayws.readyAsk')}</b><small>{t('dayws.readyAskSub')}</small></span>
          </button>
        </div>
      )}

      {mode === 'custom' && (
        <>
          {limited && <p className="daya-thin">{t('day.limitedData')}</p>}

          <div className="daya-search">
            <SearchIcon size={14} />
            <input
              type="text"
              value={query}
              onChange={(e) => { onQuery(e.target.value); setShown(PAGE); }}
              placeholder={t('dayws.searchPlaceholder', { city: city || '' })}
              aria-label={t('day.poiSearchAria')}
            />
            {query.trim().length > 0 && (
              <button className="daya-search-clear" onClick={() => onQuery('')} aria-label={t('day.clearSearch')}>×</button>
            )}
          </div>

          {searching ? (
            <>
              {searchResults.map(({ item, idx, note }) => (
                <PlaceCard
                  key={idx}
                  item={item}
                  idx={idx}
                  note={note}
                  added={assignedIdx.includes(idx)}
                  focused={focusedIdx === idx}
                  onToggle={onToggle}
                  onFocus={onFocus}
                  t={t}
                />
              ))}
              {/* The catalogue is a head start, never a gate. */}
              {query.trim().length >= 3 && !exactHit && (
                <button className="daya-custom-add" onClick={() => onAddCustom(query)} disabled={customBusy}>
                  {customBusy
                    ? <><span className="daya-spin" aria-hidden="true" /> {t('day.customAdding')}</>
                    : <><PlusIcon size={13} /> {t('day.customAdd', { q: query.trim() })}</>}
                </button>
              )}
              {searchResults.length === 0 && (
                <p className="daya-empty">{t('day.poiSearchEmpty', { q: query.trim(), city: city || 'here' })}</p>
              )}
            </>
          ) : (
            <>
              <div className="daya-picks" role="group" aria-label={t('dayws.picksAria')}>
                {PICKS.map(({ key, labelKey }) => (
                  <button
                    key={key}
                    className={`daya-pick${pick === key ? ' on' : ''}`}
                    onClick={() => { setPick(key); setShown(PAGE); }}
                    aria-pressed={pick === key}
                  >{t(labelKey)}</button>
                ))}
              </div>

              {suggShown && (
                <div className="daya-sugg">
                  <div className="daya-sugg-title"><SparkIcon size={11} /> {t('dayws.suggTitle')}</div>
                  {suggestions.map(({ item, idx, note }) => (
                    <button key={`s${idx}`} className="daya-sugg-row" onClick={() => onToggle(idx)}>
                      <span className="daya-sugg-text">
                        <b>{item.name}</b>
                        <small>{note}</small>
                      </span>
                      <span className="daya-sugg-add"><PlusIcon size={12} /></span>
                    </button>
                  ))}
                </div>
              )}

              {filtered.slice(0, shown).map(({ item, idx }) => (
                <PlaceCard
                  key={idx}
                  item={item}
                  idx={idx}
                  added={assignedIdx.includes(idx)}
                  focused={focusedIdx === idx}
                  onToggle={onToggle}
                  onFocus={onFocus}
                  t={t}
                />
              ))}
              {filtered.length === 0 && <p className="daya-empty">{t('dayws.pickNone')}</p>}
              {shown < filtered.length && (
                <button className="daya-more-btn" onClick={() => setShown((n) => n + PAGE)}>
                  {t('dayws.showMore', { n: Math.min(PAGE, filtered.length - shown) })}
                </button>
              )}

              {/* Too far to walk to, too good to leave unmentioned. */}
              {farDeck.length > 0 && pick !== 'active' && (
                <div className="daya-far">
                  <div className="daya-far-title">
                    <MountainIcon size={11} /> {t('day.worthDetour')}
                  </div>
                  {farDeck.slice(0, 4).map(({ item, idx, km }) => (
                    <PlaceCard
                      key={`f${idx}`}
                      item={item}
                      idx={idx}
                      note={t('day.kmFromDayTrip', { km: Math.round(km), city: city || 'town' })}
                      added={assignedIdx.includes(idx)}
                      focused={focusedIdx === idx}
                      onToggle={onToggle}
                      onFocus={onFocus}
                      t={t}
                    />
                  ))}
                </div>
              )}

              <p className="daya-tip">
                <MapPinIcon size={11} /> {t('dayws.mapTip')}
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
