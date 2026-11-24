import React, { useRef, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { useSettings } from '../../components/SettingsLine.jsx';
import { useFirstRun } from '../../lib/firstRunContext.js';
import { Button } from '../../components/ui/index.js';
import { ArrowRightIcon, PlusIcon, SparkIcon } from '../../components/Icons.jsx';
import { SheetShell } from '../../browse/SheetShell.jsx';
import { StyleCards } from '../../browse/styles/StyleCards.jsx';
import { styleName, useStyleFigures } from '../../browse/styles/styleBits.jsx';
import { holdForTrip, restyleTrip, styleDraftOfTrip } from './styleSeed.js';

/**
 * The settings context with the app's choices setter beside it (G12 B3:
 * holdForTrip('sleep') writes the bed through setChoices, which lives in
 * the first-run context, not the settings context).
 */
// eslint-disable-next-line react-refresh/only-export-components -- a hook shared by the bar and the assumption chips
export function useHoldApp() {
  const app = useSettings();
  const ctx = useFirstRun();
  return app ? { ...app, setChoices: ctx?.setChoices || app.setChoices } : null;
}

/**
 * The style switch at the top of every Plan flow step (G12 plan rethink,
 * owner 2026-11-24: "people can choose and switch style during the flow").
 * It names the trip's style (or "No style") and opens the style cards
 * (the Style Studio's own data, hooks/useTravelStyles.js). A pick is for
 * this trip: holdForTrip holds the active style (decision 0011, "Changed for
 * now"), never ts.switchTo; Keep makes it the active style, Undo goes back.
 * The trip is re-seeded (restyleTrip keeps every answer the traveller gave),
 * so the flow then asks what the new style does not hold and re-prices.
 * "New travel style" opens the Style Studio over this step; closing it
 * comes back here. The studio stays the only place a style is edited.
 *
 *   settings, save(next)   the trip's settings and their store
 */
export function StyleSwitch({ settings, save }) {
  const { t } = useI18n();
  const app = useHoldApp();
  const ts = app?.travelStyles || null;
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const figures = useStyleFigures(ts?.list, app?.data?.destinations);
  if (!ts) return null;
  const st = (ts.list || []).find((x) => x.id === settings.style) || null;
  const name = st ? styleName(t, st) : t('pf.style.none');
  const pick = (id) => {
    const next = holdForTrip(settings, 'style', id, app);
    if (next !== settings) save(next);
    setOpen(false);
  };
  const none = () => {
    save(holdForTrip(settings, 'style', null, app));
    setOpen(false);
  };
  // Undo: the app's own style again, and the trip re-seeded from it.
  const undo = () => {
    ts.revert?.();
    save(restyleTrip(settings, ts.active || null));
  };
  const held = Boolean(ts.held && settings.style && settings.style !== ts.activeId);
  return (
    <div className="pf-stylebar">
      <Button
        ref={btnRef}
        variant="secondary"
        size="sm"
        className={`pf-stylebar-btn${st ? '' : ' is-none'}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t('pf.style.aria', { name })}
        onClick={() => setOpen(true)}
      >
        {name}
      </Button>
      {held && (
        <span className="pf-stylebar-held">
          <span className="pf-stylebar-kicker">{t('styles.kickerChanged')}</span>
          <Button variant="quiet" size="sm" onClick={() => ts.keep?.()}>{t('studio.heldKeep')}</Button>
          <Button variant="quiet" size="sm" onClick={undo}>{t('studio.heldUndo')}</Button>
        </span>
      )}
      {open && (
        <SheetShell title={t('styles.tripStyle')} onClose={() => setOpen(false)} anchorRef={btnRef} width={440} className="pf-settings pf-stylebar-sheet">
          <div className="pf-set-edit">
            {ts.list?.length > 0 && (
              <StyleCards compact list={ts.list} activeId={settings.style || ''} onPick={pick} label={t('styles.tripStyle')} figures={figures} />
            )}
            <div className="pf-stylebar-acts">
              {settings.style && <Button variant="quiet" size="sm" onClick={none}>{t('pf.style.without')}</Button>}
              <Button variant="quiet" size="sm" iconStart={<PlusIcon size={16} />} onClick={() => { setOpen(false); ts.setOpen({ view: 'create' }); }}>
                {t('studio.new')}
              </Button>
            </div>
          </div>
        </SheetShell>
      )}
    </div>
  );
}

/**
 * "Save as travel style" after the first result (G12 §12): a traveller with
 * no style answered the style questions once; saving them makes a style
 * (createFrom, then the studio on its name), so the next trip skips them.
 * Shown only while the traveller has no style at all.
 */
export function SaveStyleOffer({ settings }) {
  const { t } = useI18n();
  const app = useSettings();
  const ctx = useFirstRun();
  const ts = app?.travelStyles;
  if (!ts?.createFrom || ts.list?.length) return null;
  const go = () => {
    const id = ts.createFrom(styleDraftOfTrip(settings, ctx?.choices || {}));
    ts.setOpen(id ? { view: 'edit', id, step: 'name' } : { view: 'create' });
  };
  return (
    <section className="pf-refine pf-savestyle" aria-labelledby="pf-savestyle-title">
      <span className="pf-refine-icon" aria-hidden="true"><SparkIcon size={20} /></span>
      <div className="pf-refine-text">
        <h3 className="pf-refine-title" id="pf-savestyle-title">{t('pf.saveStyle.title')}</h3>
        <p className="pf-refine-sub">{t('pf.saveStyle.sub')}</p>
      </div>
      <div className="pf-refine-acts">
        <Button variant="secondary" size="sm" iconEnd={<ArrowRightIcon size={16} />} onClick={go}>{t('pf.saveStyle.go')}</Button>
      </div>
    </section>
  );
}
