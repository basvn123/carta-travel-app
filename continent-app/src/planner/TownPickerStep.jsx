import React, { useMemo, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import {
  HomeIcon, SearchIcon, SparkIcon, MapPinIcon,
} from '../components/Icons.jsx';
import { ScoreChip } from '../components/RatingBadge.jsx';
import { DayExploreMap } from '../map/DayExploreMap.jsx';
import { geocodeAddress } from '../lib/geocode.js';

/**
 * TownPickerStep, the Carta chat's "where do you want to spend the day?"
 * answer, four ways to land on the same thing: a real destination id.
 *
 *   Nearby  the ranked short list the chat already offered
 *   Search  type any city; matches Carta's own catalogue first, and falls
 *           back to a real-world geocode (Nominatim) for anywhere else
 *   Map     the stay-centred explore map, pins only, tap to pick
 *   Ask     free-text wish to Carta's AI, which reads the local catalogue
 *           and (optionally) the web, and proposes a short list
 *
 * Search and Ask both may land on a place outside the catalogue; those
 * resolve to the nearest real destination via `resolveNearest`, so the day
 * planner downstream always gets a catalogue id it has POIs for.
 */

const TABS = [
  { key: 'nearby', labelKey: 'chat.townTabNearby', Icon: HomeIcon },
  { key: 'search', labelKey: 'chat.townTabSearch', Icon: SearchIcon },
  { key: 'map', labelKey: 'chat.townTabMap', Icon: MapPinIcon },
  { key: 'ai', labelKey: 'chat.townTabAi', Icon: SparkIcon },
];

const AI_FAIL_KEY = {
  user_cap: 'ai.quotaUser', global_cap: 'ai.quotaGlobal', auth: 'ai.signIn',
};

export function TownPickerStep({
  towns, nearbyOptions, stayPoint, cityOptions, resolveNearest, onSuggestCity, onPick,
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState('nearby');
  const [query, setQuery] = useState('');
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoResults, setGeoResults] = useState(null);
  const [note, setNote] = useState('');
  // A geocode hit or an AI web discovery isn't a catalogue id: it waits here,
  // disclosed, until the traveller actively confirms the nearest real
  // destination Carta actually has data for (never an instant, unreadable
  // swap under their tap).
  const [pendingPick, setPendingPick] = useState(null);
  const [aiText, setAiText] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiResults, setAiResults] = useState(null);
  const [aiFail, setAiFail] = useState('');

  const searchMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const starts = [];
    const contains = [];
    for (const c of cityOptions || []) {
      const lo = c.label.toLowerCase();
      if (lo.startsWith(q)) starts.push(c);
      else if (contains.length < 8 && lo.includes(q)) contains.push(c);
      if (starts.length >= 8) break;
    }
    return [...starts, ...contains].slice(0, 8);
  }, [query, cityOptions]);

  // Land on a place with no catalogue id of its own (a geocode hit or an AI
  // web discovery): find the nearest real destination, but don't pick it yet
  // - surface the disclosure and let the traveller confirm.
  const pickResolved = (lat, lon, queryLabel) => {
    const nearest = resolveNearest ? resolveNearest(lat, lon) : null;
    setPendingPick(null);
    if (!nearest) { setNote(t('chat.townNoData', { q: queryLabel })); return; }
    setNote('');
    setPendingPick(nearest);
  };

  const runGeoSearch = async () => {
    if (query.trim().length < 3 || geoBusy) return;
    setGeoBusy(true);
    setNote('');
    setPendingPick(null);
    const res = await geocodeAddress(query.trim());
    setGeoResults(res);
    setGeoBusy(false);
  };

  const runAiSuggest = async () => {
    if (!aiText.trim() || aiBusy) return;
    setAiBusy(true);
    setAiFail('');
    setAiResults(null);
    setPendingPick(null);
    const res = await onSuggestCity(aiText.trim());
    if (res?.ok) setAiResults(res.suggestions || []);
    else setAiFail(res?.code || 'ai_error');
    setAiBusy(false);
  };

  const pendingPickCard = pendingPick && (
    <div className="chat-town-resolve">
      <p className="trip-note chat-town-note">
        {t('chat.townClosest', { city: pendingPick.label, km: pendingPick.km })}
      </p>
      <button className="chat-opt" onClick={() => onPick(pendingPick.id, pendingPick.label)}>
        <HomeIcon size={16} />
        <span className="chat-opt-text"><b>{t('chat.townUseThis', { city: pendingPick.label })}</b></span>
      </button>
    </div>
  );

  return (
    <div className="chat-town-picker">
      <div className="chat-town-tabs" role="tablist">
        {TABS.map((tb) => {
          const Icon = tb.Icon;
          return (
            <button
              key={tb.key}
              type="button"
              role="tab"
              className={`chat-town-tab ${tab === tb.key ? 'on' : ''}`}
              aria-selected={tab === tb.key}
              onClick={() => { setTab(tb.key); setPendingPick(null); }}
            >
              <Icon size={14} /> {t(tb.labelKey)}
            </button>
          );
        })}
      </div>

      {tab === 'nearby' && (
        <div className="chat-opts">
          {(nearbyOptions || []).map((o) => (
            <button key={o.key} className="chat-opt" onClick={() => onPick(o.key, o.label)}>
              <HomeIcon size={16} />
              <span className="chat-opt-text">
                <b>{o.label}</b>
                {o.sub && <small>{o.sub}</small>}
              </span>
              {o.rating?.score != null && <ScoreChip rating={o.rating} size="xs" />}
            </button>
          ))}
          {!nearbyOptions?.length && <p className="trip-note">{t('chat.townNoNearby')}</p>}
        </div>
      )}

      {tab === 'search' && (
        <div className="chat-town-search">
          <div className="chat-free">
            <input
              className="chat-free-input"
              type="text"
              maxLength={80}
              value={query}
              placeholder={t('chat.townSearchPlaceholder')}
              onChange={(e) => { setQuery(e.target.value); setGeoResults(null); setNote(''); setPendingPick(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !searchMatches.length) runGeoSearch(); }}
              autoFocus
            />
          </div>
          {note && <p className="trip-note chat-town-note">{note}</p>}
          {searchMatches.length > 0 ? (
            <div className="chat-opts">
              {searchMatches.map((c) => (
                <button key={c.value} className="chat-opt" onClick={() => onPick(c.value, c.label)}>
                  <MapPinIcon size={16} />
                  <span className="chat-opt-text"><b>{c.label}</b></span>
                </button>
              ))}
            </div>
          ) : query.trim().length >= 3 && (
            <div className="chat-town-anywhere">
              <button className="chat-send" onClick={runGeoSearch} disabled={geoBusy}>
                <SearchIcon size={13} /> {geoBusy ? '…' : t('chat.townSearchAnywhere')}
              </button>
              {pendingPickCard}
              {!pendingPick && geoResults && (
                geoResults.length ? (
                  <div className="chat-opts">
                    {geoResults.map((r, i) => (
                      <button key={i} className="chat-opt" onClick={() => pickResolved(r.lat, r.lon, r.shortLabel || r.label)}>
                        <MapPinIcon size={16} />
                        <span className="chat-opt-text"><b>{r.shortLabel || r.label}</b></span>
                      </button>
                    ))}
                  </div>
                ) : <p className="trip-note">{t('chat.townNoMatch')}</p>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'map' && (
        <div className="chat-town-map">
          {stayPoint ? (
            <DayExploreMap
              stay={{ lat: stayPoint.lat, lon: stayPoint.lon, label: stayPoint.shortLabel || stayPoint.label }}
              markers={(towns || [])
                .filter((tn) => tn.lat != null && tn.lon != null)
                .map((tn) => ({
                  id: tn.id, label: tn.dest?.city || '', lat: tn.lat, lon: tn.lon, cat: 'town',
                }))}
              onFocus={(id) => {
                const tn = (towns || []).find((x) => x.id === id);
                onPick(id, tn?.dest?.city || '');
              }}
            />
          ) : <p className="trip-note">{t('chat.townNoStay')}</p>}
        </div>
      )}

      {tab === 'ai' && (
        <div className="chat-town-ai">
          <div className="chat-free">
            <input
              className="chat-free-input"
              type="text"
              maxLength={160}
              value={aiText}
              placeholder={t('chat.townAiPlaceholder')}
              onChange={(e) => setAiText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') runAiSuggest(); }}
              autoFocus
            />
            <button className="chat-send" onClick={runAiSuggest} disabled={aiBusy || !aiText.trim()}>
              <SparkIcon size={13} /> {aiBusy ? '…' : t('chat.townAiAsk')}
            </button>
          </div>
          {note && <p className="trip-note chat-town-note">{note}</p>}
          {aiBusy && (
            <div className="chat-bubble bot chat-typing"><span /><span /><span /></div>
          )}
          {aiFail && (
            <p className="trip-note chat-town-note">{t(AI_FAIL_KEY[aiFail] || 'ai.error')}</p>
          )}
          {pendingPickCard}
          {!pendingPick && aiResults && (
            aiResults.length ? (
              <div className="chat-opts">
                {aiResults.map((s, i) => (
                  <button
                    key={i}
                    className="chat-opt"
                    onClick={() => (s.inCatalog && s.id
                      ? onPick(s.id, `${s.name}${s.country ? `, ${s.country}` : ''}`)
                      : pickResolved(s.lat, s.lon, s.name))}
                  >
                    {s.inCatalog ? <HomeIcon size={16} /> : <SparkIcon size={16} />}
                    <span className="chat-opt-text">
                      <b>{s.name}{s.country ? `, ${s.country}` : ''}</b>
                      {s.why && <small>{s.why}</small>}
                    </span>
                  </button>
                ))}
              </div>
            ) : <p className="trip-note">{t('chat.townAiEmpty')}</p>
          )}
        </div>
      )}
    </div>
  );
}
