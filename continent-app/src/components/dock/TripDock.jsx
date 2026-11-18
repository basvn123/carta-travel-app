import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useI18n } from '../../i18n/index.jsx';
import { Button, Segmented } from '../ui/index.js';
import { HouseIcon } from '../HouseIcons.jsx';
import { DatesControl, useDatePick, useSettings, useShortDate, whenValue } from '../SettingsLine.jsx';
import { useTripLine } from '../SearchDock.jsx';
import { FromPanel, fromName, fromPoint } from '../FromPicker.jsx';
import { AirportReach } from '../AirportReach.jsx';
import { HeartIcon } from '../Icons.jsx';
import { styleName } from '../../browse/styles/styleBits.jsx';
import { Dock, DockRowButton, DockRowField, useDockBack } from './Dock.jsx';
import { closeDock } from './dockStore.js';
import { openStudio } from '../../browse/styles/studioDoors.js';

/**
 * The Trip dock (G12, explore polish; decision.md change 1): what belongs to
 * this trip only, under the category tabs on the right. Four rows and
 * nothing else: the travel style (a hand-over to the Style Studio, the one
 * place a style is edited, so no style setting lives here), From, When, and how
 * prices read. From and When drill in place; Back or Escape steps out.
 *
 * Mounted wherever a priced list starts (the Explore overview and focused
 * list, the Destinations tabs); every copy reads the same SettingsContext,
 * and the one dock store keeps at most one card open.
 */
export function TripDock({ className = '' }) {
  const s = useSettings();
  const { t } = useI18n();
  const summary = useTripLine(s);
  if (!s) return null;
  return (
    <Dock
      id="trip"
      anchor="under-tabs"
      className={`trip-dock ${className}`.trim()}
      glyph={<HouseIcon.tune size={24} />}
      label={t('dock.tripAria', { summary })}
      title={t('dock.tripTip', { summary })}
      heading={t('dock.trip')}
    >
      <TripRows s={s} />
    </Dock>
  );
}

function TripRows({ s }) {
  const { t } = useI18n();
  const shortDate = useShortDate();
  const baseId = useId();
  const [view, setView] = useState(null); // null | 'from' | 'when'
  const { pickEnd, setPickEnd, pickDate } = useDatePick(s);
  const bodyRef = useRef(null);
  const lastRow = useRef(null);

  // Escape inside a drilled row steps back to the rows first (Dock.jsx).
  const back = useCallback(() => {
    if (!view) return false;
    lastRow.current = view;
    setView(null);
    return true;
  }, [view]);
  const ctx = useDockBack(back);

  // Focus follows the drill: into the panel on the way in, back onto the row
  // it came from on the way out, so a keyboard never lands on the body.
  useEffect(() => {
    const root = bodyRef.current;
    if (!root) return;
    if (view) {
      root.querySelector('.trip-dock-back')?.focus({ preventScroll: true });
    } else if (lastRow.current) {
      root.querySelector(`[data-dock-row="${lastRow.current}"]`)?.focus({ preventScroll: true });
      lastRow.current = null;
    }
  }, [view]);

  // A closed dock opens on its rows next time.
  useEffect(() => { if (!ctx?.isOpen) setView(null); }, [ctx?.isOpen]);

  const ts = s.travelStyles;
  const active = ts?.active || null;
  // Explore top (G12): the style's door is always the heart, as on the disc.
  const name = active ? styleName(t, active) : t('styles.choose');
  const changed = Boolean(active && ts?.changed);
  const from = fromName(s) || t('origin.pickTown');
  const when = whenValue(t, s, shortDate);
  const party = Number.isFinite(s.party) ? s.party : 2;
  const mayFly = !['train', 'bus', 'car'].includes(s.transportMode);
  const fromLabel = t('dock.from');
  const whenLabel = t('dates.when');

  if (view) {
    const title = view === 'from' ? fromLabel : whenLabel;
    return (
      <div className="trip-dock-drill" ref={bodyRef}>
        <div className="trip-dock-drill-head">
          <Button variant="quiet" size="sm" className="trip-dock-back" iconStart={<HouseIcon.back size={18} />}
            onClick={() => back()}>
            {t('dock.back')}
          </Button>
          <h3 className="trip-dock-drill-title">{title}</h3>
        </div>
        <div className="trip-dock-panel">
          {view === 'from' && (
            <>
              <FromPanel data={s.data} current={fromPoint(s)} autoFocus={false} onPick={(p) => s.setFrom(p)} />
              {s.setAirports && s.fromPlace && mayFly && (
                <section className="settings-airports" aria-labelledby={`${baseId}-airports`}>
                  <h4 className="settings-sheet-h" id={`${baseId}-airports`}>{t('pf.q.airports')}</h4>
                  <AirportReach
                    meta={s.data?.meta}
                    point={s.fromPlace}
                    covered={s.sweptOrigins}
                    hours={s.airportHours}
                    codes={s.airports}
                    labelId={`${baseId}-airports-list`}
                    onChange={(codes, hours) => s.setAirports(codes, hours)}
                  />
                </section>
              )}
            </>
          )}
          {view === 'when' && (
            <DatesControl s={s} pickEnd={pickEnd} setPickEnd={setPickEnd} pickDate={pickDate} shortDate={shortDate} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="trip-dock-rows" ref={bodyRef}>
      {ts && (
        <DockRowButton
          index={0}
          rowKey="style"
          label={t('studio.rowLabel')}
          ariaLabel={t('dock.styleRowAria', { name }) + (changed ? `. ${t('styles.kickerChanged')}` : '')}
          value={(
            <span className="trip-dock-style">
              <span className={`tstyle-disc${active ? ` tone-${active.tone}` : ''}`} aria-hidden="true"><HeartIcon size={16} /></span>
              <span className="trip-dock-style-name">{name}</span>
              {changed && <span className="trip-dock-changed">{t('styles.kickerChanged')}</span>}
            </span>
          )}
          onClick={() => {
            closeDock('trip');
            // Two frames: the closing dock hands focus back to its trigger
            // one frame after it closes; the studio opens after that, so its
            // own focus move wins and its close returns focus to this pill.
            requestAnimationFrame(() => requestAnimationFrame(() => openStudio(ts)));
          }}
        />
      )}
      <DockRowButton
        index={1}
        rowKey="from"
        label={fromLabel}
        value={from}
        ariaLabel={t('dock.rowAria', { label: fromLabel, value: from })}
        onClick={() => setView('from')}
      />
      <DockRowButton
        index={2}
        rowKey="when"
        label={whenLabel}
        value={when}
        ariaLabel={t('dock.rowAria', { label: whenLabel, value: when })}
        onClick={() => { setPickEnd('start'); setView('when'); }}
      />
      {/* How prices read (T694): only when there is a group to divide. */}
      {s.setPriceView && party >= 2 && (
        <DockRowField index={3} rowKey="prices" label={t('party.view')} labelId={`${baseId}-prices`}>
          <Segmented
            label={t('party.view')}
            size="sm"
            className="price-view trip-dock-prices"
            value={s.priceView === 'total' ? 'total' : 'pp'}
            onChange={s.setPriceView}
            options={[
              { value: 'pp', label: t('party.viewPp') },
              { value: 'total', label: t('party.viewTotal') },
            ]}
          />
        </DockRowField>
      )}
    </div>
  );
}
