import React from 'react';
import { useI18n } from '../i18n/index.jsx';
import { SheetShell } from './SheetShell.jsx';

/**
 * The system, explained on the page itself (PLAN.md C8).
 *
 * A line under the Explore control bar naming the four verdict tiers with
 * their LIVE counts (read from the catalogue, never hardcoded - the tier
 * language and cutoffs ship in meta.rating_model). Users trust a rating
 * they can see the shape of; until now "Worth the journey" was only
 * inferable from what wore it. The kind glyphs left the line in v5: the
 * card names its kind in words now, and the filter rail's chips carry the
 * glyphs beside those same words.
 *
 * v5 took the box away: a bordered card at the head of the page read as
 * the page's first content, and it is a key, not content. It is now one
 * quiet line, and the separators are drawn, not typed.
 *
 * Dismissible and remembered (localStorage): once read, it folds to a small
 * "?" affordance that brings it back. "How the score works" expands the
 * one-paragraph method inline - the same claim RatingBreakdown makes on
 * every destination page, so the two can be read against each other.
 */

const SEEN_KEY = 'carta.tierLegendDismissed.v1';

export function TierLegend({ data }) {
  const { t } = useI18n();
  const [dismissed, setDismissed] = React.useState(() => {
    try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return false; }
  });
  const [why, setWhy] = React.useState(false);
  const whyRef = React.useRef(null);

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
        aria-label={t('legend.show')} title={t('legend.show')}>?</button>
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
              <span>{counts[tier]}</span>
              {cuts[String(tier)] && (
                <span className="tierlegend-cut">{Number(cuts[String(tier)]).toFixed(1)}+</span>
              )}
            </span>
          </span>
        ))}
        <span className="tierlegend-row">
          <span className="tierlegend-mark tl-gem" aria-hidden="true" />
          <span className="tierlegend-label">{t('legend.gem')}</span>
          <span className="tierlegend-count mono"><span>{counts.gem}</span></span>
        </span>
        <span className="tierlegend-actions">
          {/* The explainer is a real button on the row's baseline, and it
              opens the method in the app's sheet. Inline, it reflowed the
              legend under itself and pushed the grid down a paragraph. */}
          <button className="tierlegend-why" onClick={() => setWhy(true)}
            ref={whyRef} aria-haspopup="dialog" aria-expanded={why}>
            <span className="tierlegend-why-mark" aria-hidden="true">?</span>
            {t('legend.how')}
          </button>
          <button className="tierlegend-x" onClick={() => set(true)}
            aria-label={t('legend.dismiss')} title={t('legend.dismiss')}>×</button>
        </span>
      </div>
      {why && (
        <SheetShell
          title={t('legend.how')}
          onClose={() => setWhy(false)}
          anchorRef={whyRef}
          width={460}
          className="tiersheet"
          labelId="tiersheet-title"
          closeLabel={t('legend.closeMethod')}
        >
          <div className="tiersheet-body">
            <p className="tiersheet-method">{t('rating.method')}</p>
            <div className="tiersheet-rows">
              {[3, 2, 1].map((tier) => (
                <span key={tier} className="tiersheet-row">
                  <span className={`tierlegend-mark tl-${tier}`} aria-hidden="true" />
                  <span className="tiersheet-name">{t(`rating.tier${tier}`)}</span>
                  <span className="tiersheet-cut">
                    {cuts[String(tier)]
                      ? t('legend.cutCount', { cut: Number(cuts[String(tier)]).toFixed(1), n: counts[tier] })
                      : counts[tier]}
                  </span>
                </span>
              ))}
              <span className="tiersheet-row">
                <span className="tierlegend-mark tl-gem" aria-hidden="true" />
                <span className="tiersheet-name">{t('legend.gem')}</span>
                <span className="tiersheet-cut">{counts.gem}</span>
              </span>
            </div>
          </div>
        </SheetShell>
      )}
    </aside>
  );
}
