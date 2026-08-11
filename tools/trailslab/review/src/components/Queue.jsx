import { km, metres, score } from '../format.js';

const STATUSES = ['needs_review', 'draft', 'approved', 'rejected', 'published', 'all'];
const SORTS = [
  ['curation', 'curation rank'],
  ['quality', 'quality score'],
  ['distance', 'distance'],
  ['recent', 'recently changed'],
  ['title', 'title'],
];

export default function Queue({
  filters, setFilters, trips, total, loading, selectedId, onSelect, countries,
}) {
  const patch = (next) => setFilters({ ...filters, ...next, offset: 0 });
  const page = Math.floor(filters.offset / filters.limit) + 1;
  const pages = Math.max(1, Math.ceil(total / filters.limit));

  return (
    <div className="queue">
      <div className="queue-filters">
        <div className="chiprow">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              className={`chip${filters.status === s ? ' on' : ''}`}
              onClick={() => patch({ status: s })}
            >
              {s.replace('_', ' ')}
            </button>
          ))}
        </div>
        <div className="chiprow">
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="q">Find</label>
            <input
              id="q"
              value={filters.q}
              placeholder="Via Alpina, or a relation id"
              onChange={(e) => patch({ q: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="country">In</label>
            <select
              id="country"
              value={filters.country}
              onChange={(e) => patch({ country: e.target.value })}
            >
              <option value="">all</option>
              {countries.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div className="chiprow">
          <div className="field" style={{ flex: 1 }}>
            <label htmlFor="sort">Sort</label>
            <select
              id="sort"
              value={filters.sort}
              onChange={(e) => patch({ sort: e.target.value })}
            >
              {SORTS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="category">Kind</label>
            <select
              id="category"
              value={filters.category}
              onChange={(e) => patch({ category: e.target.value })}
            >
              <option value="">all</option>
              <option value="hike">hike</option>
              <option value="daytrip">daytrip</option>
            </select>
          </div>
        </div>
      </div>

      <div className="queue-list">
        {!loading && !trips.length && (
          <div className="empty">
            <h2>Queue is clear</h2>
            <p>Nothing matches these filters. Widen the country or the status.</p>
          </div>
        )}
        {trips.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`queue-row${t.id === selectedId ? ' sel' : ''}`}
            onClick={() => onSelect(t.id)}
          >
            <div className="title">{t.title}</div>
            <div className="facts">
              <span>{t.country}</span>
              <span>{km(t.distance_m)}</span>
              <span>{metres(t.ascent_m)} up</span>
              <b>{score(t.quality_score)}</b>
              {t.portal_ok && <span title="Confirmed against the national portal">portal</span>}
              {t.has_description && <span title="Has a generated description">text</span>}
            </div>
          </button>
        ))}
      </div>

      <div className="queue-foot">
        <span className="mono">{total} trips</span>
        <span className="spacer" style={{ flex: 1 }} />
        <button
          type="button"
          className="chip"
          disabled={filters.offset === 0}
          onClick={() => setFilters({ ...filters, offset: Math.max(0, filters.offset - filters.limit) })}
        >
          Back
        </button>
        <span className="mono">{page} of {pages}</span>
        <button
          type="button"
          className="chip"
          disabled={page >= pages}
          onClick={() => setFilters({ ...filters, offset: filters.offset + filters.limit })}
        >
          Next
        </button>
      </div>
    </div>
  );
}
