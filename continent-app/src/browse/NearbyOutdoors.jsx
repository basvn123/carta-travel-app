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
 * A block the page asks for and the join left empty keeps its heading and
 * says so in one line (T367, docs/ONBOARDING_AND_EMPTY_STATES.md, "The
 * detail-page rule"): no published walk within the join's own radius, and
 * the nearest one in the country as a link. That claim is only made for a
 * row the join DID stamp (it carries an `nb` block): the join drops the key
 * on a row where it found nothing at all, and a layer file rebuilt after the
 * join carries no `nb` anywhere (the wire of 2026-10-02 holds none on 23,292
 * rows), so a row without the block is "not measured", never "nothing
 * there", and renders nothing as before. A layer pair the join has no rule
 * for (a mountain's lakes) was never searched either, so it stays silent.
 */
import { useI18n } from '../i18n/index.jsx';
import { ScoreChip } from '../components/RatingBadge.jsx';
import { NB_ORDER, nbDistanceKm, useNeighbours } from '../lib/neighbours.js';
import { trailRating } from '../lib/trailCards.js';
import { stripDashes } from '../lib/format.js';
import { NearestLine } from './CoverageEmpty.jsx';

/** pipeline/joins/neighbours.py RULES (also in public/joins.json as
 *  rules_km_limit): the radius in km each source layer searched each
 *  neighbour layer at. '*' is every other layer. */
const NB_RADIUS_KM = {
  'beach:trail': 5, 'beach:beach': 15, 'beach:cycle': 3,
  'lake:trail': 4, 'lake:peak': 15,
  'peak:trail': 6, 'peak:peak': 20,
  'trail:beach': 3, 'trail:lake': 2, 'trail:peak': 3,
  'cycle:*': 5,
};
const radiusOf = (src, dst) => NB_RADIUS_KM[`${src}:${dst}`] ?? NB_RADIUS_KM[`${src}:*`] ?? null;

/** The page's own layer, read off its heading keys (nb.{page}.{neighbour}). */
const PAGE_OF_KEY = { beach: 'beach', lake: 'lake', mtn: 'peak', trail: 'trail', cycle: 'cycle' };

/** A neighbour layer against the lib/coverageEmpty.js loader and the noun. */
const NB_LOADER = { trail: 'trail', peak: 'mountain', lake: 'lake', beach: 'beach', cycle: 'cycling' };
const NB_NOUN = {
  trail: 'cov.n.trail', peak: 'cov.n.mountain', lake: 'cov.n.lake',
  beach: 'cov.n.beach', cycle: 'cov.n.cycling',
};
/** The loader layer against the `onOpen` layer name the pages expect. */
const OPEN_NB = { trail: 'trail', mountain: 'peak', lake: 'lake', beach: 'beach', cycling: 'cycle' };

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
  const firstKey = Object.values(headings || {})[0] || '';
  const self = PAGE_OF_KEY[firstKey.split('.')[1]] || null;
  const stamped = !!row?.nb && typeof row.nb === 'object';
  const layers = NB_ORDER.filter((k) => headings?.[k]
    && (resolved[k]?.length || (stamped && self && radiusOf(self, k) != null)));
  if (!layers.length) return null;
  const place = stripDashes(row?.name || '');
  return (
    <div className="nbx">
      {layers.map((layer) => (
        <section className="nbx-block" key={layer}>
          <h2>{t(headings[layer])}</h2>
          {resolved[layer]?.length ? (
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
          ) : (
            <NearestLine
              noneKey={place ? 'nb.none' : 'nb.noneHere'}
              noneVars={{ things: t(NB_NOUN[layer]), km: radiusOf(self, layer), place }}
              layers={[NB_LOADER[layer]]}
              cc={cc}
              from={row}
              skipId={layer === self ? row?.id : null}
              radiusKm={radiusOf(self, layer)}
              onOpen={onOpen ? (l, r) => onOpen(OPEN_NB[l] || l, r) : null}
            />
          )}
        </section>
      ))}
    </div>
  );
}
