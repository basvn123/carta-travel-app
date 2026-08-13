import React from 'react';
import { composeTrip, fareCoverageRanges } from '../lib/runtime_pricing.js';
import { knownFor } from '../lib/knownFor.js';
import { ScoreChip, HiddenGemTag, tierClass } from '../components/RatingBadge.jsx';
import { WaterQualityBadge, swimRelevant } from '../components/WaterQualityBadge.jsx';
import { CrowdingBadge, crowdBadgeWorthShowing } from '../components/CrowdingBadge.jsx';
import { BestTimePanel } from './BestTimePanel.jsx';
import { safeUrl, PRICE_SOURCE_LABELS, ACCOM_SOURCE_LABELS } from '../lib/format.js';
import { ReceiptIcon, CalendarIcon, InfoIcon, TreeIcon, PersonIcon } from '../components/Icons.jsx';
import { useI18n } from '../i18n/index.jsx';
import { BreakdownTab, ViaAirportOptions } from './DetailBreakdown.jsx';

const fmtDate = (iso) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/** Collapsible block for secondary panel content. The body stays mounted so
 *  the open/close can animate (grid-rows 0fr -> 1fr); visibility gates the
 *  tab order while closed. */
function PanelAccordion({ icon, title, meta, defaultOpen = false, children }) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className={`panel-acc ${open ? 'open' : ''}`}>
      <button type="button" className="panel-acc-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {icon && <span className="panel-acc-icon">{icon}</span>}
        <span className="panel-acc-title">{title}</span>
        {meta && <span className="panel-acc-meta">{meta}</span>}
        <svg className="panel-acc-chev" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"
          fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      <div className="acc-fold" aria-hidden={!open}>
        <div className="acc-fold-inner">
          <div className="panel-acc-body">{children}</div>
        </div>
      </div>
    </div>
  );
}

// "City, 1.2M" style line from the GeoNames slice (population + settlement).
const popLine = (g) => {
  if (!g) return '';
  const settle = g.settlement ? g.settlement.charAt(0).toUpperCase() + g.settlement.slice(1) : '';
  const n = g.population;
  const pop = n == null ? ''
    : n >= 1_000_000 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`
    : n >= 10_000 ? `${Math.round(n / 1000)}k`
    : n.toLocaleString('en-GB');
  return [settle, pop].filter(Boolean).join(', ');
};

export function DetailPanel({ destination, departDate, returnDate, choices, setChoices, priceMode = 'total', onClose, onOpenLifestyle, onSelect, data, isFavorite, onToggleFavorite, onSaveTrip, onShiftDates }) {
  const { t } = useI18n();
  const [saveState, setSaveState] = React.useState('idle'); // idle | saving | saved
  const [activeTab, setActiveTab] = React.useState('breakdown'); // breakdown | best-time

  // Below 768px the panel is a bottom sheet over the map, opening at a half
  // snap so the pin that was tapped stays visible; drag the grip (or tap it)
  // to move between half, full and closed. Above 768px it stays the fixed
  // side panel and the grip disappears.
  const [isNarrow, setIsNarrow] = React.useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches,
  );
  const [sheetH, setSheetH] = React.useState(null); // px; null = CSS half snap
  const [dragging, setDragging] = React.useState(false);
  const sheetRef = React.useRef(null);
  const scrollRef = React.useRef(null);
  const dragRef = React.useRef(null);

  React.useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia('(max-width: 768px)');
    const onChange = (e) => setIsNarrow(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Land back on the breakdown, at the half snap, scrolled to the top,
  // whenever the user picks a different destination.
  React.useEffect(() => {
    setActiveTab('breakdown');
    setSheetH(null);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [destination?.id]);

  // The sheet's snap geometry, measured live: the gap under the sheet is the
  // bottom nav, so full height = containing block minus that gap.
  const snapPoints = () => {
    const sheet = sheetRef.current;
    const parent = sheet?.offsetParent;
    if (!sheet || !parent) return null;
    const bottomGap = parent.clientHeight - sheet.offsetTop - sheet.offsetHeight;
    const full = parent.clientHeight - bottomGap - 10;
    const half = Math.min(Math.round(full * 0.62), 560);
    return { half, full };
  };

  const onGripDown = (e) => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    dragRef.current = { startY: e.clientY, startH: sheet.offsetHeight, moved: false, snaps: snapPoints() };
    setDragging(true);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* older browsers */ }
  };
  const onGripMove = (e) => {
    const st = dragRef.current;
    if (!st || !st.snaps) return;
    const dy = st.startY - e.clientY; // drag up -> taller
    if (Math.abs(dy) > 4) st.moved = true;
    setSheetH(Math.max(80, Math.min(st.snaps.full, st.startH + dy)));
  };
  const onGripUp = (e) => {
    const st = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* older browsers */ }
    if (!st || !st.snaps) return;
    const { half, full } = st.snaps;
    const h = sheetRef.current?.offsetHeight || half;
    if (!st.moved) {
      // Tap: toggle half <-> full.
      setSheetH(h > (half + full) / 2 ? half : full);
      return;
    }
    // Flung low = dismiss; otherwise settle on the nearest snap.
    if (h < half * 0.55) { setSheetH(null); onClose?.(); return; }
    setSheetH(h > (half + full) / 2 ? full : half);
  };

  if (!destination) {
    return <div className="panel dest-panel" aria-hidden="true" />;
  }

  const handleSaveTrip = async () => {
    if (!onSaveTrip || saveState === 'saving') return;
    setSaveState('saving');
    try {
      await onSaveTrip(destination);
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 2000);
    } catch {
      setSaveState('idle');
    }
  };

  const breakdown = composeTrip(destination, departDate, returnDate, choices, data?.destinations);
  const anchor = breakdown?.anchor_airport || destination.iata;
  // Show the anchor airport as a city name, not an IATA code.
  const anchorCity = anchor ? (data?.destinations?.[anchor]?.city || anchor) : null;
  const image = destination.image;

  return (
    <div
      ref={sheetRef}
      className={`panel dest-panel open ${dragging ? 'dragging' : ''}`}
      style={isNarrow && sheetH != null ? { height: sheetH } : undefined}
    >
      {/* Grip: the sheet's handle on phones (drag to resize, tap to toggle
          half/full). display:none above 768px. */}
      <div
        className="dest-grip-hit"
        onPointerDown={onGripDown}
        onPointerMove={onGripMove}
        onPointerUp={onGripUp}
        onPointerCancel={onGripUp}
        aria-hidden="true"
      >
        <div className="dest-grip" />
      </div>
      <button className="panel-close" onClick={onClose} aria-label={t('detail.close')}>
        <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"
          fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M5 5l14 14M19 5L5 19" />
        </svg>
      </button>

      <div className="dest-panel-scroll" ref={scrollRef}>
      {/* The most impressive image of the region (Wikipedia lead photo). */}
      {image?.url && (
        <div className="panel-hero" style={{ backgroundImage: `url(${image.url})` }}>
          <div className="panel-hero-shade" />
          {safeUrl(image.page) && (
            <a className="panel-hero-credit" href={safeUrl(image.page)} target="_blank" rel="noreferrer"
               title={image.credit ? t('detail.wikipediaCredit', { credit: image.credit }) : t('detail.wikipediaSource')}>
              Wikipedia
            </a>
          )}
        </div>
      )}

      <div className={`panel-header ${image?.url ? 'has-hero' : ''}`}>
        <div className="panel-tag">{t('detail.tag')}</div>
        <h2 className="panel-city">{destination.city}</h2>
        {destination.rating?.score != null && (
          <div className="panel-rating-row">
            <ScoreChip rating={destination.rating} size="lg" />
            {destination.rating.label && (
              <span className={`rating-label ${tierClass(destination.rating)}`}>
                {destination.rating.label}
              </span>
            )}
            {destination.rating.hidden_gem && <HiddenGemTag size="lg" />}
            {swimRelevant(destination) && (
              <WaterQualityBadge bathing={destination.bathing_water} t={t} size="lg" />
            )}
            {crowdBadgeWorthShowing(destination) && (
              <CrowdingBadge crowding={destination.crowding} t={t} size="lg" />
            )}
          </div>
        )}
        <div className="panel-country">
          {destination.country}
          {destination.tier === 'gem' && anchorCity && (
            <span className="panel-via">
              {t('detail.via', { city: anchorCity })}
              {breakdown?.ground_one_way_eur > 0 && t('detail.viaGround', { n: breakdown.ground_one_way_eur })}
              {breakdown?.ground_minutes > 0 && t('detail.viaMinutes', { n: breakdown.ground_minutes })}
            </span>
          )}
        </div>
        {knownFor(destination) && (
          <div className="panel-knownfor">{knownFor(destination)}</div>
        )}
        <div className="panel-action-row">
          {onToggleFavorite && (
            <button
              className={`panel-fav ${isFavorite ? 'on' : ''}`}
              onClick={onToggleFavorite}
              aria-label={isFavorite ? t('detail.removeShortlist') : t('detail.addShortlist')}
              title={isFavorite ? t('detail.removeShortlist') : t('detail.addShortlist')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"
                fill={isFavorite ? 'currentColor' : 'none'}
                stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
                <polygon points="12 2 15.1 8.6 22 9.3 16.8 14 18.3 21 12 17.3 5.7 21 7.2 14 2 9.3 8.9 8.6" />
              </svg>
              <span>{isFavorite ? t('detail.shortlisted') : t('detail.shortlist')}</span>
            </button>
          )}
          {onSaveTrip && (
            <button
              className={`panel-fav ${saveState === 'saved' ? 'on' : ''}`}
              onClick={handleSaveTrip}
              disabled={saveState === 'saving'}
              aria-label={t('detail.saveTripTitle')}
              title={t('detail.saveTripTitle')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"
                fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
              <span>{saveState === 'saving' ? t('detail.saving') : saveState === 'saved' ? t('detail.saved') : t('detail.saveTrip')}</span>
            </button>
          )}
        </div>
      </div>

      {/* About this place, folded away by default: population, the nearest
          protected area, and a short Wikivoyage lead. The guide text follows
          the data language (like POI names/descriptions); only the labels are
          translated. */}
      {(destination.guide?.text || destination.nature?.nearest?.name
        || destination.geonames?.population != null || destination.geonames?.settlement) && (
        <div className="panel-section panel-section-acc">
          <PanelAccordion
            icon={<InfoIcon size={13} />}
            title={t('detail.aboutTitle', { city: destination.city })}
            meta={popLine(destination.geonames) || null}
          >
            {(destination.geonames?.population != null || destination.geonames?.settlement) && popLine(destination.geonames) && (
              <div className="panel-about-fact">
                <PersonIcon size={13} />
                <span>{t('detail.population')}: {popLine(destination.geonames)}</span>
              </div>
            )}
            {destination.nature?.nearest?.name && (
              <div className="panel-about-fact">
                <TreeIcon size={13} />
                <span>
                  {t('detail.nearestNature')}: {destination.nature.nearest.name}
                  {destination.nature.nearest.kind ? ` (${destination.nature.nearest.kind})` : ''}
                  {destination.nature.nearest.dist_km != null ? `, ${destination.nature.nearest.dist_km} km` : ''}
                </span>
              </div>
            )}
            {destination.guide?.text && (
              <p className="panel-about-guide">
                {destination.guide.text}
                {safeUrl(destination.guide.url) && (
                  <> <a className="panel-about-guide-link" href={safeUrl(destination.guide.url)}
                        target="_blank" rel="noreferrer">{t('detail.readGuide')}</a></>
                )}
              </p>
            )}
          </PanelAccordion>
        </div>
      )}

      {!breakdown ? (
        <div className="panel-section">
          <p style={{ fontStyle: 'italic', color: 'var(--ink-mute)' }}>
            {(() => {
              const originCity = data?.meta?.origins?.[data?.meta?.selected_origin]?.city || t('detail.yourAirport');
              const flyable = Object.keys(destination.routes || {}).length > 0;
              return flyable
                ? t('detail.noFareFrom', { origin: originCity })
                : t('detail.noFlightsTooFar', { origin: originCity, city: destination.city });
            })()}
          </p>
          {Object.keys(destination.routes || {}).length > 0 && (() => {
            const ranges = fareCoverageRanges(destination);
            if (ranges.length === 0) return null;
            return (
              <p className="panel-fare-coverage">
                {ranges.length === 1 ? t('detail.fareCoverageOne') : t('detail.fareCoverageMany')}{' '}
                {ranges.map((r, i) => (
                  <span key={r.start}>
                    {i > 0 && ', '}
                    {fmtDate(r.start)} - {fmtDate(r.end)}
                  </span>
                ))}
              </p>
            );
          })()}
          <ViaAirportOptions
            destination={destination}
            data={data}
            departDate={departDate}
            returnDate={returnDate}
            choices={choices}
            onSelect={onSelect}
          />
        </div>
      ) : (
        <>
          <div className="tabs panel-tabs">
            <button
              className={`tab tab-iconed ${activeTab === 'breakdown' ? 'active' : ''}`}
              onClick={() => setActiveTab('breakdown')}
            >
              <ReceiptIcon size={12} /> {t('detail.tabBreakdown')}
            </button>
            <button
              className={`tab tab-iconed ${activeTab === 'best-time' ? 'active' : ''}`}
              onClick={() => setActiveTab('best-time')}
            >
              <CalendarIcon size={12} /> {t('detail.tabBestTime')}
            </button>
          </div>

          {activeTab === 'breakdown' ? (
            <BreakdownTab
              key={destination.id}
              destination={destination}
              breakdown={breakdown}
              departDate={departDate}
              returnDate={returnDate}
              choices={choices}
              setChoices={setChoices}
              priceMode={priceMode}
              onOpenLifestyle={onOpenLifestyle}
              data={data}
              anchor={anchor}
              anchorCity={anchorCity}
              onSelect={onSelect}
            />
          ) : (
            <BestTimePanel
              destination={destination}
              departDate={departDate}
              returnDate={returnDate}
              breakdown={breakdown}
              choices={choices}
              data={data}
              onShiftDates={onShiftDates}
            />
          )}
        </>
      )}
      </div>
    </div>
  );
}

/** A grouped block of cost rows: icon-led header with the group subtotal on
 *  the right, rows inside. Mirrors the lifestyle panel's card treatment so
 *  transport / stay / on-the-ground read as three clearly distinct buckets. */
