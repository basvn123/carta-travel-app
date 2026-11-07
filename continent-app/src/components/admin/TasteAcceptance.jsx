import { tasteWindowView, MIN_DECISIONS } from '../../lib/taste/counts.js';

const FACETS = { activity: 'Activity', setting: 'Setting', vibe: 'Vibe', traveller: 'Who', practical: 'Practical' };
const BUCKETS = { 1: 'Places 1 to 3', 2: 'Places 4 to 6', 3: 'Place 7 on' };
const pct = (x) => (x == null ? 'too few' : `${Math.round(x * 100)}%`);

function Rows({ cells, label }) {
  return cells.map((c) => (
    <tr key={label(c)}>
      <th scope="row">{label(c)}</th>
      <td className="num">{c.shown}</td>
      <td className="num">{c.accept}</td>
      <td className="num">{c.reject}</td>
      <td className="num">{pct(c.acceptance)}</td>
      <td className="num">{pct(c.decision)}</td>
    </tr>
  ));
}

function Table({ caption, head, cells, label }) {
  return (
    <div className="adminpage-tablewrap" tabIndex={0}>
      <table className="adminpage-table">
        <caption className="adminpage-muted">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{head}</th>
            <th scope="col" className="num">Shown</th>
            <th scope="col" className="num">Yes</th>
            <th scope="col" className="num">Not me</th>
            <th scope="col" className="num">Acceptance</th>
            <th scope="col" className="num">Decision rate</th>
          </tr>
        </thead>
        <tbody><Rows cells={cells} label={label} /></tbody>
      </table>
    </div>
  );
}

// Taste chip acceptance by week (F3, T1152-d, T1215): the cookieless counter
// of migration 072 read through admin_taste_weekly. Acceptance is yes over
// yes plus not me; the decision rate (yes plus not me over shown) sits beside
// it, because a chip left alone is not an acceptance. A rate needs
// MIN_DECISIONS counts. Owner-only, so not i18n'd like the counters around it.
export function TasteAcceptance({ report }) {
  if (!report) return null;
  const view = tasteWindowView(report);
  return (
    <section className="adminpage-card" data-admin="taste-acceptance">
      <h2 className="adminpage-h2">Taste chips (weekly)</h2>
      <p className="adminpage-muted">
        How often a traveller says Yes or Not me to a chip on My trips, Your Europe. Counted per day with no
        cookie and no identifier. A rate shows from {MIN_DECISIONS} counts; early chips are seen more, so read
        the position split before the facet split.
      </p>
      {!view ? (
        <p className="adminpage-muted" data-taste-admin="unavailable">
          Not counted yet: needs migration 072 (taste profile) in Supabase.
        </p>
      ) : view.total.shown === 0 && view.total.decisions === 0 ? (
        <p className="adminpage-muted" data-taste-admin="empty">No taste chips counted in this window.</p>
      ) : (
        <>
          <div className="adminpage-tiles">
            <div className="adminpage-tile"><b>{pct(view.total.acceptance)}</b><span>Acceptance</span></div>
            <div className="adminpage-tile"><b>{pct(view.total.decision)}</b><span>Decision rate</span></div>
            <div className="adminpage-tile"><b>{view.total.decisions}</b><span>Decisions</span></div>
            <div className="adminpage-tile"><b>{view.total.shown}</b><span>Chips shown</span></div>
          </div>
          <Table caption="By position" head="Position" cells={view.byBucket} label={(c) => BUCKETS[c.bucket]} />
          <Table caption="By facet" head="Facet" cells={view.byFacet} label={(c) => FACETS[c.facet]} />
          {view.weeks.length > 1 && (
            <ol className="adminpage-rank">
              {view.weeks.map((w) => (
                <li key={w.week}>
                  <span className="adminpage-rankname">Week of {w.week}</span>
                  <span className="adminpage-ranknum">{pct(w.acceptance)} of {w.decisions}</span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}
