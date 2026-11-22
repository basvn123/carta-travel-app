import React from 'react';
import { DiamondIcon } from '../../components/Icons.jsx';
import { HouseIcon } from '../../components/HouseIcons.jsx';
import { Button } from '../../components/ui/index.js';

/**
 * The overview's head (T586, T595, T601). G12 (Explore top, decision.md
 * APPROVED 2026-11-18): the search, Ask and Settings moved into the band in
 * the top bar, so they never scroll away; All filters, Strong match and the
 * Trip dock left with the filter pane. What stays here, on a desktop, is the
 * quiet row: three of the rails' doors (each opens what its See all opens)
 * and the map toggle. A phone draws the rails' doors under the band, so the
 * overview keeps only its name for a screen reader.
 */
export function OverviewHero({ t, TitleTag, viewToggle, quick, docked = false }) {
  if (docked) {
    // tabIndex -1: the applied row hands focus here when it empties.
    return <TitleTag className="xov-title sr-only" id="xov-title" tabIndex={-1}>{t('explore.heroTitle')}</TitleTag>;
  }
  return (
    <section className="xov-hero xov-hero--hs" aria-labelledby="xov-title">
      <TitleTag className="xov-title sr-only" id="xov-title">{t('explore.heroTitle')}</TitleTag>
      <div className="xov-picks">
        <div className="xov-quick" role="group" aria-label={t('explore.quickAria')}>
          {quick.slice(0, 3).map((r) => (
            <Button key={r.key} variant="secondary" size="sm" className="xquick-chip"
              iconStart={QUICK_ICONS[r.key] ? React.createElement(QUICK_ICONS[r.key], { size: 16 }) : null}
              onClick={r.seeAll}>
              {r.short || r.title}
            </Button>
          ))}
          {viewToggle}
        </div>
      </div>
    </section>
  );
}

/** The quick chips' icons: the same line icons the filter pane uses. */
const QUICK_ICONS = {
  saved: HouseIcon.bookmark, gems: DiamondIcon, nocar: HouseIcon.train, quiet: HouseIcon.people,
  cost: HouseIcon.gauge, now: HouseIcon.sun, top: HouseIcon.star, hiking: HouseIcon.trails, beach: HouseIcon.beaches,
};
