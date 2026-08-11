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
 * Search and Ask both may land on a place outside the catalogue. When that
 * happens the traveller is offered the town they actually asked for: Carta
 * researches it live (`onResearchCity`, see lib/cityResearch.js), which mints
 * a real destination id with a real POI list. Snapping to the nearest
 * catalogued city via `resolveNearest` is still there, but as the fallback it
 * always should have been: someone who types Lokeren wants Lokeren, not Ghent
 * 20 km away.
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
  towns, nearbyOptions, stayPoint, cityOptions, resolveNearest, onResearchCity, onSuggestCity, onPick,
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState('nearby');
  const [query, setQuery] = useState('');
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoResults, setGeoResults] = useState(null);
  const [note, setNote] = useState('');
  // A geocode hit or an AI web discovery isn't a catalogue id: it waits here,
  // disclosed, until the traveller says what to do with it (research the town
  // itself, or settle for the nearest one Carta already holds). Never an
  // instant, unreadable swap under their tap.
  const [pendingPick, setPendingPick] = useState(null);
  const [research, setResearch] = useState(null); // { stage, vars } while harvesting
  const [researchFail, setResearchFail] = useState('');
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
  // web discovery). Nothing is picked yet: the traveller is shown what Carta
  // knows about that place (usually nothing) and offered the two real answers,
  // research it or use a neighbour.
  const pickResolved = (lat, lon, queryLabel, country = '') => {
    setNote('');
    setResearchFail('');
    setResearch(null);
    setPendingPick({
      name: queryLabel,
      country,
      lat,
      lon,
      nearest: resolveNearest ? resolveNearest(lat, lon) : null,
    });
  };

  // Go and get the town. Progress is the real harvest's own stages, so the
  // wait shows which source is being read rather than a spinner.
  const runResearch = async () => {
    if (!pendingPick || research || !onResearchCity) return;
    setResearchFail('');
    setResearch({ stage: 'locate', vars: { name: pendingPick.name } });
    const res = await onResearchCity(
      {
        name: pendingPick.name, country: pendingPick.country, lat: pendingPick.lat, lon: pendingPick.lon,
      },
      ({ key, vars }) => setResearch({ stage: key, vars: vars || {} }),
    );
    setResearch(null);
    if (res?.ok) {
      setPendingPick(null);
      onPick(res.id, res.label);
      return;
    }
    setResearchFail(res?.code || 'not_found');
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

  // The off-catalogue card: what was asked for, what Carta holds, and the two
  // ways forward. Research leads, because it answers the question that was
  // actually asked.
  const pendingPickCard = pendingPick && (
    <div className="chat-town-resolve">
      {research ? (
        <div className="chat-town-working">
          <p className="trip-note">
            <SparkIcon size={13} /> {t(`chat.townResearch.${research.stage}`, { ...research.vars, name: pendingPick.name })}
          </p>
          <div className="chat-bubble bot chat-typing"><span /><span /><span /></div>
        </div>
      ) : (
        <>
          <p className="trip-note chat-town-note">
            {researchFail
              ? t(`chat.townResearchFail.${researchFail}`, { name: pendingPick.name })
              : t('chat.townUnknown', { name: pendingPick.name })}
          </p>
          {onResearchCity && researchFail !== 'no_sights' && (
            <button className="chat-opt chat-opt-lead" onClick={runResearch}>
              <SparkIcon size={16} />
              <span className="chat-opt-text">
                <b>{t('chat.townResearchGo', { name: pendingPick.name })}</b>
                <small>{t('chat.townResearchSub')}</small>
              </span>
            </button>
          )}
          {pendingPick.nearest ? (
            <button
              className="chat-opt"
              onClick={() => onPick(pendingPick.nearest.id, pendingPick.nearest.label)}
            >
              <HomeIcon size={16} />
              <span className="chat-opt-text">
                <b>{t('chat.townUseThis', { city: pendingPick.nearest.label })}</b>
                <small>{t('chat.townClosest', { km: pendingPick.nearest.km })}</small>
              </span>
            </button>
          ) : (
            <p className="trip-note">{t('chat.townNoData', { q: pendingPick.name })}</p>
          )}
        </>
      )}
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
              // A harvest in flight ends by picking its town, so leaving the
              // tab mid-run would advance the wizard from somewhere the
              // traveller can no longer see.
              disabled={!!research}
              onClick={() => { setTab(tb.key); setPendingPick(null); setResearchFail(''); }}
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
                      <button key={i} className="chat-opt" onClick={() => pickResolved(r.lat, r.lon, r.name || r.shortLabel || r.label, r.country)}>
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
                      : pickResolved(s.lat, s.lon, s.name, s.country))}
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
