import React from 'react';
import { Pressable } from '../components/ui/Pressable.jsx';
import { useI18n } from '../i18n/index.jsx';
import { useSettings } from '../components/SettingsLine.jsx';
import { Button } from '../components/ui/index.js';
import { HouseIcon } from '../components/HouseIcons.jsx';
import { ChevronDownIcon } from '../components/Icons.jsx';
import { SheetShell } from './SheetShell.jsx';
import { StyleCards } from './styles/StyleCards.jsx';
import { styleIcon, styleName, useStyleFigures } from './styles/styleBits.jsx';
import { formatMoney } from '../lib/money.js';
import { partyText } from '../lib/party.js';
import { useSettledFigure } from '../lib/figureChange.js';

/**
 * "Priced for", the first block of Explore's filter pane (Style Studio, G12).
 *
 * Every figure in Explore follows the active travel style (its party, bed,
 * table and way there are the priced choices), so the pane opens on what the
 * prices are for: the style's disc, its name and its day figure. A tap opens
 * the switcher, anchored under the block on a pointer screen and a small
 * sheet on a phone (SheetShell does both), with the style cards for a
 * one-tap switch and "Edit styles" into the studio. The switcher stays open
 * after a pick: arrow keys switch as they move (radio semantics), and on a
 * wide screen the list behind reprices while it is open, which is the proof
 * the switch did something.
 *
 * With no style the block says what the prices use now (the party and the
 * bed from the choices, never a made-up default) and offers to create one.
 * While a trip holds the style the figure hides: the prices follow the
 * trip's changes then, not the style.
 */
export function PricedFor() {
  const { t } = useI18n();
  const s = useSettings();
  const ts = s?.travelStyles;
  const list = React.useMemo(() => ts?.list || [], [ts?.list]);
  const figures = useStyleFigures(list, s?.data?.destinations);
  const [open, setOpen] = React.useState(false);
  const btnRef = React.useRef(null);
  const headId = React.useId();
  const active = ts?.active || null;
  const fig = active ? figures.get(active.id) ?? null : null;
  const price = Number.isFinite(fig) ? formatMoney(fig, { precision: 'whole' }) : '';
  const figRef = React.useRef(null);
  // A switch settles the figure in place (one opacity dip, the house rule
  // for a value that changes; nothing under reduced motion).
  useSettledFigure(figRef, price);
  if (!ts) return null;

  if (!active) {
    const seats = Number.isFinite(s.party) ? s.party : 2;
    const kids = s.children || 0;
    const people = partyText(t, { adults: Math.max(1, seats - kids), children: kids, babies: s.babies || 0 });
    const bed = t(`stay.${s.stayTier || 'home'}`);
    return (
      <section className="xpane-sec xpane-priced" aria-labelledby={headId}>
        <div className="xpane-priced-card is-none">
          <span className="xpane-priced-disc" aria-hidden="true"><HouseIcon.pack size={18} /></span>
          <span className="xpane-priced-text">
            <span className="xpane-priced-label" id={headId}>{t('filter.pricedFor')}</span>
            {/* Who and the bed on a line each, so the bed's label keeps its
                own capital ("Entire place") instead of sitting mid-sentence. */}
            <span className="xpane-priced-name">{people}</span>
            <span className="xpane-priced-sub">{bed}</span>
          </span>
        </div>
        <Button variant="secondary" size="sm" block className="xpane-priced-create"
          iconStart={<HouseIcon.plus size={16} />}
          onClick={() => ts.setOpen({ view: 'create' })}>
          {t('filter.pricedForCreate')}
        </Button>
      </section>
    );
  }

  const Icon = styleIcon(active);
  const name = styleName(t, active);
  // The choices differ from the style (a trip's change, a link): the prices
  // are not the style's, so its figure would be the wrong number here.
  const held = ts.changed;
  return (
    <section className="xpane-sec xpane-priced">
      <Pressable
        ref={btnRef}
        className={`xpane-priced-card xpane-priced-btn${held ? ' is-held' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="xpane-priced-disc" aria-hidden="true"><Icon size={18} /></span>
        <span className="xpane-priced-text">
          <span className="xpane-priced-label">{t('filter.pricedFor')}</span>
          {/* The space keeps label and name two words for whatever reads
              the button's text (T1128). */}
          {' '}
          <span className="xpane-priced-name">{name}</span>
          {held && (
            <span className="xpane-priced-held">
              <span className="xpane-priced-held-dot" aria-hidden="true" />
              {t('filter.pricedForHeld')}
            </span>
          )}
        </span>
        {!held && price && (
          <span className="xpane-priced-fig">
            {' '}
            <span className="xpane-priced-num" ref={figRef}>{price}</span>
            {' '}
            <span className="xpane-priced-unit">{t('studio.aDayEach')}</span>
          </span>
        )}
        <ChevronDownIcon size={16} className="xpane-priced-chev" />
      </Pressable>
      {open && (
        <SheetShell
          title={t('filter.pricedFor')}
          labelId={`${headId}-sw`}
          className="xpane-priced-sheet"
          width={380}
          anchorRef={btnRef}
          closeLabel={t('a11y.close')}
          onClose={() => setOpen(false)}
        >
          <StyleCards
            compact
            list={list}
            activeId={ts.activeId}
            figures={figures}
            label={t('filter.pricedForList')}
            onPick={(id) => ts.switchTo(id)}
          />
          <Button variant="quiet" block className="xpane-priced-edit"
            iconStart={<HouseIcon.edit size={16} />}
            onClick={() => { setOpen(false); ts.setOpen({ view: 'overview' }); }}>
            {t('filter.pricedForEdit')}
          </Button>
        </SheetShell>
      )}
    </section>
  );
}
