import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as api from './api.js';
import { hours, km, metres, num, osmUrl, score, stamp } from './format.js';
import Queue from './components/Queue.jsx';
import TripMap from './components/TripMap.jsx';
import ElevationProfile from './components/ElevationProfile.jsx';
import { MetricsCard, TagsCard, RepairCard } from './components/Metrics.jsx';
import { ChecksCard, PortalCard } from './components/Checks.jsx';

const INITIAL_FILTERS = {
  status: 'needs_review', country: 'CH', q: '', category: '', sort: 'curation',
  limit: 50, offset: 0,
};

export default function App() {
  const [health, setHealth] = useState(null);
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [queue, setQueue] = useState({ trips: [], total: 0 });
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [flash, setFlash] = useState(null);
  const [busy, setBusy] = useState(false);

  const [draft, setDraft] = useState('');
  const [note, setNote] = useState('');
  const [portal, setPortal] = useState(null);
  const [showPortal, setShowPortal] = useState(false);
  const [showRepair, setShowRepair] = useState(true);
  const detailPane = useRef(null);

  useEffect(() => {
    api.getHealth().then(setHealth).catch((e) => setFlash({ bad: true, text: e.message }));
  }, []);

  // Confirmations fade, failures stay until the next action replaces them.
  useEffect(() => {
    if (!flash || flash.bad) return undefined;
    const t = setTimeout(() => setFlash(null), 6000);
    return () => clearTimeout(t);
  }, [flash]);

  const loadQueue = useCallback(async (keepSelection = true) => {
    setLoadingQueue(true);
    try {
      const data = await api.getQueue(filters);
      setQueue(data);
      if (!keepSelection || !data.trips.some((t) => t.id === selectedId)) {
        setSelectedId(data.trips.length ? data.trips[0].id : null);
      }
    } catch (e) {
      setFlash({ bad: true, text: e.message });
    } finally {
      setLoadingQueue(false);
    }
  }, [filters, selectedId]);

  // Filters own the queue; selection follows it only when the current trip
  // falls out of the result set.
  useEffect(() => { loadQueue(false); /* eslint-disable-next-line */ }, [
    filters.status, filters.country, filters.q, filters.category, filters.sort,
    filters.offset,
  ]);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return undefined; }
    let live = true;
    setLoadingDetail(true);
    setPortal(null);
    setShowPortal(false);
    setNote('');
    api.getTrip(selectedId)
      .then((d) => {
        if (!live) return;
        setDetail(d);
        setDraft(d.trip.description_md || '');
        if (detailPane.current) detailPane.current.scrollTop = 0;
      })
      .catch((e) => live && setFlash({ bad: true, text: e.message }))
      .finally(() => live && setLoadingDetail(false));
    return () => { live = false; };
  }, [selectedId]);

  const trip = detail?.trip;
  const dirty = !!trip && draft.trim() !== (trip.description_md || '').trim();
  const portalCheck = useMemo(
    () => (detail?.checks.latest || []).find((c) => c.check_name === 'portal_agreement'),
    [detail],
  );

  const togglePortal = async () => {
    if (showPortal) { setShowPortal(false); return; }
    setShowPortal(true);
    if (portal || !selectedId) return;
    try {
      setPortal(await api.getPortal(selectedId));
    } catch (e) {
      setFlash({ bad: true, text: e.message });
    }
  };

  const refreshAfterWrite = async (text) => {
    setFlash({ text });
    const fresh = await api.getTrip(selectedId);
    setDetail(fresh);
    setDraft(fresh.trip.description_md || '');
    setNote('');
    const data = await api.getQueue(filters).catch(() => null);
    if (data) setQueue(data);
  };

  const onSave = async () => {
    if (!trip || busy) return;
    setBusy(true);
    try {
      const res = await api.saveEdits(trip.id, { description_md: draft, note: note || null });
      await refreshAfterWrite(res.saved ? 'Edits saved' : 'Nothing changed');
    } catch (e) {
      setFlash({ bad: true, text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const onDecide = async (action) => {
    if (!trip || busy) return;
    setBusy(true);
    try {
      // Pending edits travel with the decision, so Approve commits the text
      // on screen rather than whatever was stored before the reviewer typed.
      const res = await api.decide(trip.id, {
        action, note: note || null, ...(dirty ? { description_md: draft } : {}),
      });
      await refreshAfterWrite(`${trip.title} is now ${res.status}`);
    } catch (e) {
      setFlash({ bad: true, text: e.message });
    } finally {
      setBusy(false);
    }
  };

  const counts = health?.counts || {};

  return (
    <div className="app">
      <header className="topbar">
        <h1>Trailslab review</h1>
        <span className="fact">
          {health ? `${health.db.dbname} on ${health.db.host}:${health.db.port}` : 'connecting'}
        </span>
        <span className="fact">
          {num(counts.needs_review || 0)} waiting, {num(counts.approved || 0)} approved
        </span>
        <span className="spacer" />
        {flash && (
          <span className={`flash${flash.bad ? ' bad' : ' good'}`}>{flash.text}</span>
        )}
        <span className="fact">{health?.reviewer ? `reviewing as ${health.reviewer}` : ''}</span>
      </header>

      <div className="body">
        <Queue
          filters={filters}
          setFilters={setFilters}
          trips={queue.trips}
          total={queue.total}
          loading={loadingQueue}
          selectedId={selectedId}
          onSelect={setSelectedId}
          countries={health?.countries || []}
        />

        <div className="detail" ref={detailPane}>
          {!trip && (
            <div className="empty">
              <h2>Pick a trip from the queue</h2>
              <p>
                {loadingDetail || loadingQueue
                  ? 'Loading'
                  : 'Nothing is selected. The queue on the left holds everything waiting on a decision.'}
              </p>
            </div>
          )}

          {trip && (
            <div className="detail-inner">
              <div className="trip-head">
                <div style={{ flex: 1 }}>
                  <h2>{trip.title}</h2>
                  <div className="sub">
                    <span>{trip.country}</span>
                    <span>{trip.category}</span>
                    <span>{km(trip.distance_m)}</span>
                    <span>{metres(trip.ascent_m)} up</span>
                    <span>{hours(trip.duration_min)}</span>
                    <span>{trip.difficulty || 'no difficulty'}</span>
                    <span>{trip.network || 'no network'}</span>
                    <span>quality {score(trip.quality_score)}</span>
                    {osmUrl(trip) && (
                      <a href={osmUrl(trip)} target="_blank" rel="noreferrer">
                        {trip.source} {trip.source_ref}
                      </a>
                    )}
                  </div>
                </div>
                <span className={`status ${trip.status}`}>{trip.status.replace('_', ' ')}</span>
              </div>

              <section className="card">
                <header>
                  <h3>Geometry</h3>
                  <span className="spacer" />
                  {detail.repair && (
                    <button
                      type="button"
                      className={`toggle${showRepair ? ' on' : ''}`}
                      onClick={() => setShowRepair(!showRepair)}
                    >
                      <span className="swatch" style={{ background: '#8f5a0c' }} />
                      Repaired line
                    </button>
                  )}
                  <button
                    type="button"
                    className={`toggle${showPortal ? ' on' : ''}`}
                    onClick={togglePortal}
                  >
                    <span className="swatch" style={{ background: '#1f6f8b' }} />
                    Official portal trails
                  </button>
                </header>
                <TripMap
                  geometry={detail.geometry}
                  repairGeometry={detail.repair?.geometry}
                  portal={portal}
                  showRepair={showRepair && !!detail.repair}
                  showPortal={showPortal}
                />
              </section>

              <section className="card">
                <header>
                  <h3>Elevation profile</h3>
                  <span className="spacer" />
                  <span className="muted mono" style={{ fontSize: '11.5px' }}>
                    {detail.elevation.meta?.duration_rule
                      ? `duration by ${detail.elevation.meta.duration_rule}`
                      : ''}
                  </span>
                </header>
                <ElevationProfile
                  profile={detail.elevation.profile}
                  meta={detail.elevation.meta}
                />
              </section>

              <MetricsCard trip={trip} comparison={detail.comparison} />
              <ChecksCard checks={detail.checks} lastValidatedAt={trip.last_validated_at} />
              <PortalCard
                check={portalCheck}
                portal={portal}
                radius={portal?.radius_m}
              />
              <RepairCard repair={detail.repair} />
              <TagsCard trip={trip} />

              <section className="card">
                <header>
                  <h3>Description</h3>
                  <span className="spacer" />
                  <span className="muted mono" style={{ fontSize: '11.5px' }}>
                    {trip.described_at ? `generated ${stamp(trip.described_at)}`
                      : trip.description_md ? 'written in review'
                        : 'nothing generated yet'}
                    {dirty ? ', unsaved edits' : ''}
                  </span>
                </header>
                <div className="pad">
                  <textarea
                    className="description"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Two summary sentences and a short paragraph, built only from facts on this page."
                    aria-label="Trip description"
                  />
                  <p className="muted" style={{ marginTop: '8px' }}>
                    This text ships to travellers. Anything it claims has to be visible
                    somewhere else on this page.
                  </p>
                </div>
              </section>

              {detail.reviews.length > 0 && (
                <section className="card">
                  <header><h3>Review history</h3></header>
                  <ul className="history">
                    {detail.reviews.map((r, i) => (
                      <li key={`${r.created_at}-${i}`}>
                        <span className="when">{stamp(r.created_at)}</span>
                        {' '}
                        <b>{r.action}</b>
                        {r.prev_status !== r.new_status && ` ${r.prev_status} to ${r.new_status}`}
                        {r.reviewer ? ` by ${r.reviewer}` : ''}
                        {r.changed ? ` (${Object.keys(r.changed).join(', ')} edited)` : ''}
                        {r.note ? `: ${r.note}` : ''}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <div className="actions">
                <div className="note">
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Note for the record, optional"
                    aria-label="Review note"
                  />
                </div>
                <button type="button" className="btn" onClick={onSave} disabled={busy || !dirty}>
                  Save edits
                </button>
                {trip.status !== 'needs_review' && (
                  <button type="button" className="btn" onClick={() => onDecide('reopen')} disabled={busy}>
                    Reopen
                  </button>
                )}
                <button
                  type="button"
                  className="btn reject"
                  onClick={() => onDecide('reject')}
                  disabled={busy || trip.status === 'rejected'}
                >
                  Reject
                </button>
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => onDecide('approve')}
                  disabled={busy || trip.status === 'approved'}
                >
                  Approve
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
