import React from 'react';
import { PAGE } from './exploreConsts.js';
import { fromName } from '../../components/FromPicker.jsx';
import { AskChatHost } from '../ask/AskChatButton.jsx';

export function useExploreAsk({
  allRows, applyGuided, availableCountries, chips, data, favorites, gLabels, guided, isActive,
  lang, onPlanTrip, onSeedConsumed, onShowExplore, onToggleFav, openWithMember, rows, seed,
  setVisible, settingsLine, t,
}) {
  // The home page's hand-over (T462): the question replaces whatever was
  // asked before, the list starts at its top, and the field opens when the
  // visitor asked for the search itself. Only the field this width shows
  // takes the open request (the header one on a desktop, the tab's own on
  // a phone), so a hidden twin never opens a sheet of its own.
  const [openRequest, setOpenRequest] = React.useState(false);
  const [askSeed, setAskSeed] = React.useState(null);
  const clearOpenRequest = React.useCallback(() => setOpenRequest(false), []);
  // A request Explore could not take (the visitor left before it opened)
  // must not open the panel on a later visit.
  React.useEffect(() => { if (!isActive) setOpenRequest(false); }, [isActive]);
  // One hand-over makes one ask seed (T621): StrictMode runs this effect
  // twice, and two seeds asked the question twice.
  const tookSeed = React.useRef(null);
  React.useEffect(() => {
    if (!seed || tookSeed.current === seed) return;
    tookSeed.current = seed;
    if (seed.facets) {
      applyGuided(seed.facets, true);
      setVisible(PAGE);
    }
    if (seed.open) setOpenRequest(true);
    // T566: a question typed on Home is asked here at once.
    if (seed.question) {
      setAskSeed({ text: String(seed.question), n: Date.now() });
      setOpenRequest(true);
    }
    onSeedConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per hand-over: each seed is a new object
  }, [seed]);
  // Ask Carta (T558) takes the guided search's place and the budget card's:
  // one box for any question, its answer priced on the same inputs as the
  // list (the Lifestyle, the bed, the home airport's flights), and the five
  // slots kept inside it, so "Show all" is still applyGuided().
  const askPrice = React.useMemo(() => ({
    lifestyle: settingsLine?.lifestyle || null,
    stayTier: settingsLine?.stayTier || 'home',
    flights: data?.flights || null,
    dests: data?.destinations || null,
    origin: settingsLine?.origin || null,
  }), [settingsLine?.lifestyle, settingsLine?.stayTier, settingsLine?.origin, data?.flights, data?.destinations]);
  // T570: Ask Carta is a chat behind one small button (the header on
  // desktop, beside Filters on a phone), its trip card priced from the same
  // home airport, dates and party as the list.
  // T622 (owner 2026-10-23): the chat names the town only, never the
  // airport code.
  const fromTown = fromName(settingsLine)
    || (settingsLine?.origin ? (data?.meta?.origins?.[settingsLine.origin]?.city || '') : '');
  const askTrip = React.useMemo(() => ({
    origin: settingsLine?.origin || null,
    originName: fromTown,
    flights: data?.flights || null,
    depart: settingsLine?.departDate || null,
    back: settingsLine?.returnDate || null,
    party: settingsLine?.party || 2,
    stayTier: settingsLine?.stayTier || 'home',
    destinations: data?.destinations || null,
  }), [settingsLine?.origin, fromTown, settingsLine?.departDate, settingsLine?.returnDate, settingsLine?.party, settingsLine?.stayTier, data]);
  // T573: the filters on Explore now, which the chat offers to keep or
  // ignore; the rows are the list they make.
  const askFilters = React.useMemo(() => ({ labels: chips.map((c) => c.label), rows }), [chips, rows]);
  const askHost = (
    <AskChatHost
      t={t}
      lang={lang}
      guided={guided}
      rows={allRows}
      countries={availableCountries}
      labels={gLabels}
      price={askPrice}
      trip={askTrip}
      onApply={(facets, keep) => {
        applyGuided(facets, !keep);
        // Asked from another place (T574): Explore shows the list.
        if (!isActive) onShowExplore?.();
      }}
      filters={askFilters}
      onOpenPlace={openWithMember}
      onPlanTrip={onPlanTrip}
      favorites={favorites}
      onToggleFav={onToggleFav}
      openRequest={openRequest && isActive}
      seed={askSeed}
      onOpenRequested={clearOpenRequest}
    />
  );
  return { askHost };
}
