/**
 * NearbyOutdoors: the cross-layer blocks on every layer page (brief 08).
 *
 * Reads the row's build-time `nb` neighbour ids (pipeline/joins/neighbours.py)
 * and renders one section per neighbouring layer: the trails up this
 * mountain, the lake on this walk, the coast path past this beach. Ids
 * resolve against country files the session has usually already cached, so
 * the whole feature costs no geo query and at most a couple of cached
 * fetches.
 *
 * Renders nothing at all when the row has no neighbours: an empty "nearby"
 * section is a claim of emptiness the build never made.
 */
import { useI18n } from '../i18n/index.jsx';
import { ScoreChip } from '../components/RatingBadge.jsx';
import { NB_ORDER, nbDistanceKm, useNeighbours } from '../lib/neighbours.js';
import { trailRating } from '../lib/trailCards.js';

function ratingOf(layer, row) {
  if (layer === 'trail') return trailRating(row);
  if (Number.isFinite(row?.score)) {
    return { score: row.score, tier: row.tier ?? 0 };
  }
  return null;
}

function kmLabel(km) {
  if (km == null) return null;
  return km < 1 ? '<1 km' : `${Math.round(km)} km`;
}

/**
 * props:
 *   row      the page's own wire row (carries `nb`, and the point distances
 *            are measured from)
 *   cc       the row's country, which is where every neighbour id resolves
 *   headings i18n key per neighbour layer, e.g. { trail: 'nb.mtn.trail' };
 *            a layer without a heading key is not rendered, which is how a
 *            page opts in to exactly the blocks its brief names
 *   onOpen   (layer, neighbourRow) -> open that layer's page
 */
export function NearbyOutdoors({ row, cc, headings, onOpen }) {
  const { t } = useI18n();
  const resolved = useNeighbours(cc, row?.nb);
  if (!resolved) return null;
  const layers = NB_ORDER.filter((k) => headings?.[k] && resolved[k]?.length);
  if (!layers.length) return null;
  return (
    <div className="nbx">
      {layers.map((layer) => (
        <section className="nbx-block" key={layer}>
          <h2>{t(headings[layer])}</h2>
          <ul className="nbx-list">
            {resolved[layer].map((n) => {
              const km = kmLabel(nbDistanceKm(row, n));
              const rating = ratingOf(layer, n);
              return (
                <li key={`${layer}:${n.id}`}>
                  <button type="button" className="nbx-item" onClick={() => onOpen?.(layer, n)}>
                    <span className="nbx-name">{n.name}</span>
                    <span className="nbx-meta">
                      {rating
                        ? <ScoreChip rating={rating} size="sm" />
                        : <span className="nbx-unscored">{t('nb.unscored')}</span>}
                      {km && <small className="mono">{km}</small>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
