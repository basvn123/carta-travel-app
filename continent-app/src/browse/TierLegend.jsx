import React from 'react';
import { KINDS } from '../lib/taxonomy.js';
import { KindGlyph } from '../components/KindGlyph.jsx';
import { useI18n } from '../i18n/index.jsx';

/**
 * The system, explained on the page itself (PLAN.md C8).
 *
 * A strip under the Explore header naming the four verdict tiers with their
 * LIVE counts (read from the catalogue, never hardcoded - the tier language
 * and cutoffs ship in meta.rating_model) and the five kind glyphs the cards
 * and the grid spans encode. Users trust a rating they can see the shape
 * of; until now "Worth the journey" was only inferable from what wore it.
 *
 * Dismissible and remembered (localStorage): once read, it folds to a small
 * "?" affordance that brings it back. "How the score works" expands the
 * one-paragraph method inline - the same claim RatingBreakdown makes on
 * every destination page, so the two can be read against each other.
 */

const SEEN_KEY = 'carta.tierLegendDismissed.v1';

export function TierLegend({ data, defaultFolded = false }) {
  const { t } = useI18n();
  // Remembered once the reader has folded or unfolded it by hand; until
  // then the caller decides (a phone starts folded, a desktop open).
  const [dismissed, setDismissed] = React.useState(() => {
    try {
      const v = localStorage.getItem(SEEN_KEY);
      return v == null ? !!defaultFolded : v === '1';
    } catch { return !!defaultFolded; }
  });
  const [why, setWhy] = React.useState(false);

  const model = data?.meta?.rating_model || {};
  const cuts = model.tier_cutoffs || {};
  const counts = React.useMemo(() => {
    const c = { 3: 0, 2: 0, 1: 0, 0: 0, gem: 0 };
    for (const d of Object.values(data?.destinations || {})) {
      c[d.rating?.tier ?? 0] += 1;
      if (d.rating?.hidden_gem) c.gem += 1;
    }
    return c;
  }, [data]);

  const set = (v) => {
    setDismissed(v);
    try { localStorage.setItem(SEEN_KEY, v ? '1' : '0'); } catch { /* fine */ }
  };

  if (dismissed) {
    return (
      <button className="tierlegend-pip" onClick={() => set(false)}
        aria-label={t('legend.show')} title={t('legend.show')}>
        <span aria-hidden="true">?</span>
        <span className="tierlegend-pip-label">{t('explore.legendPip')}</span>
      </button>
    );
  }

  return (
    <aside className="tierlegend" aria-label={t('legend.aria')}>
      <div className="tierlegend-rows">
        {[3, 2, 1].map((tier) => (
          <span key={tier} className={`tierlegend-row rt-${tier}`}>
            <span className={`tierlegend-mark tl-${tier}`} aria-hidden="true" />
            <span className="tierlegend-label">{t(`rating.tier${tier}`)}</span>
            <span className="tierlegend-count mono">
              {counts[tier]}{cuts[String(tier)] ? ` · ${Number(cuts[String(tier)]).toFixed(1)}+` : ''}
            </span>
          </span>
        ))}
        <span className="tierlegend-row">
          <span className="tierlegend-mark tl-gem" aria-hidden="true" />
          <span className="tierlegend-label">{t('legend.gem')}</span>
          <span className="tierlegend-count mono">{counts.gem}</span>
        </span>
        <span className="tierlegend-kinds">
          {KINDS.map((k) => (
            <span key={k} className="tierlegend-kind">
              <KindGlyph kind={k} size={10} label={t(`pkind.${k}`)} />
              <span>{t(`pkind.${k}`)}</span>
            </span>
          ))}
        </span>
        <button className="tierlegend-why" onClick={() => setWhy((v) => !v)}
          aria-expanded={why}>
          {t('legend.how')}
        </button>
        <button className="tierlegend-x" onClick={() => set(true)}
          aria-label={t('legend.dismiss')} title={t('legend.dismiss')}>×</button>
      </div>
      {why && <p className="tierlegend-method">{t('rating.method')}</p>}
    </aside>
  );
}
