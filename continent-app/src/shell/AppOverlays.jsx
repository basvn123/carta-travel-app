import { Suspense } from 'react';
import { CountryPage, RegionPage, TogetherSheet, SavedTripsPanel, GuidesPanel, TogetherPage, AdminPage } from './lazyScreens.js';
import { countryName as localCountryName } from '../lib/countryName.js';
import { DestinationPage } from '../browse/DestinationPage.jsx';
import { BottomNav } from '../components/BottomNav.jsx';
import { AuthModal } from '../auth/AuthModal.jsx';
import { heldPlanWaiting } from './heldPlan.js';
import { loadTripDraft } from '../planner/tripDraftStore.js';
import { tripsStore } from '../planner/tripsStore.js';
import { TabFallback } from './TabFallback.jsx';
import { AccountPanel } from '../auth/AccountPanel.jsx';

export function AppOverlays({
  accountEntry, accountOpen, accountView, adminOpen, authConfigured, authModalMode,
  authModalOpen, backToLabel, choices, closeOverlay, countryPage, data, exploreIndices,
  favDests, favorites, goTo, goToTab, guidesOpen, handleLoadTrip, isFavorite, leaveCountryPage,
  leaveRegionPage, onAccountView, openDayForDest, openDetail, openExploreSection, openFeature,
  openFeatureFrom, openGuides, openLifestyle, openPlanInList, openRegionPage, openSaved,
  openTogether, openTripForCountry, openTripInPlanner, openTripStyles, pastAtOpen,
  pendingFriend, pendingGuide, pendingRegion, place, placeRows, planInProgress, savedCount,
  savedTripsOpen, selectedDest, selectedId, setAdminOpen, setAuthModalMode, setAuthModalOpen,
  setCountryPage, setGuidesOpen, setLifestyleOpen, setPastAtOpen, setPendingDayPlanId,
  setPendingGuide, setPendingRegion, setPendingTrip, setSavedTripsOpen, setSelectedId,
  setTogetherCode, togetherCode, togetherOpen, togetherView, toggleFav, user,
}) {
  return (
    <>
    {countryPage && (
      <div onClick={(e) => e.stopPropagation()}>
        <Suspense fallback={null}>
          <CountryPage
            iso2={countryPage}
            rows={placeRows}
            backLabel={backToLabel}
            onClose={() => setCountryPage(null)}
            onSelect={openDetail}
            favorites={favDests}
            onToggleFav={toggleFav}
            onShowAll={(cc) => { leaveCountryPage(); openExploreSection('places', cc); }}
            onOpenLayer={(layer, cc) => { leaveCountryPage(); openExploreSection(layer, cc); }}
            onOpenRegion={openRegionPage}
            onPlanTrip={(cc) => { leaveCountryPage(); openTripForCountry(cc); }}
            onOpenJourney={(card) => openFeatureFrom(
              { kind: 'country', id: countryPage, label: localCountryName(countryPage) }, 'journey', { id: card.id })}
            onSeeAllWeeks={(cc) => { leaveCountryPage(); openTripStyles(null, cc); }}
          />
        </Suspense>
      </div>
    )}

    {/* The full-screen region page, hoisted for the same reason the
        destination page is: a shared Costa de la Luz link opens over
        whatever view the recipient happens to be on. Opened from a
        country page, its back names that country. */}
    {pendingRegion && (
      <div onClick={(e) => e.stopPropagation()}>
        <Suspense fallback={null}>
          <RegionPage
            id={pendingRegion.id}
            fav={isFavorite(pendingRegion.id, 'region')}
            onFav={() => toggleFav(pendingRegion.id, 'region')}
            backLabel={countryPage ? localCountryName(countryPage) : backToLabel}
            onClose={() => setPendingRegion(null)}
            onOpenRegion={openRegionPage}
            onOpenFeature={(layer, ref, name) => openFeatureFrom(
              { kind: 'region', id: pendingRegion.id, label: name || null }, layer, ref)}
            rows={placeRows}
            onSelectDest={openDetail}
            onPlanTrip={(cc, destId) => { leaveRegionPage(); leaveCountryPage(); openTripForCountry(cc, destId); }}
            onOpenJourney={(card, name) => openFeatureFrom(
              { kind: 'region', id: pendingRegion.id, label: name || null }, 'journey', { id: card.id })}
            onSeeAllLayer={(layer, cc) => { leaveRegionPage(); leaveCountryPage(); openExploreSection(layer, cc); }}
            favorites={favDests}
            onToggleFav={toggleFav}
          />
        </Suspense>
      </div>
    )}

    {/* The full-screen destination page, hoisted above the tab blocks so it
        opens over Explore AND Destinations without a tab hop. Renders from
        the dossier contract; the PDF export renders from the same file. */}
    {selectedDest && (
      <div onClick={(e) => e.stopPropagation()}>
        <DestinationPage
          destination={selectedDest}
          data={data}
          indices={exploreIndices}
          choices={choices}
          onOpenLifestyle={openLifestyle}
          onClose={() => setSelectedId(null)}
          backLabel={backToLabel}
          onSelect={openDetail}
          isFavorite={selectedId ? isFavorite(selectedId, 'dest') : false}
          onToggleFavorite={selectedId ? () => toggleFav(selectedId, 'dest') : undefined}
          onOpenFeature={(layer, ref) => { setSelectedId(null); openFeature(layer, ref); }}
          onOpenItin={(id) => {
            setSelectedId(null);
            setPendingTrip({ id });
            goToTab('places');
          }}
          onPlanTrip={selectedDest.iso2 ? () => { setSelectedId(null); openTripForCountry(selectedDest.iso2); } : undefined}
          onPlanDay={selectedId ? () => { setSelectedId(null); openDayForDest(selectedId); } : undefined}
        />
      </div>
    )}

    <div onClick={(e) => e.stopPropagation()}>
      <BottomNav
        user={user}
        place={place}
        onNavigate={goTo}
        savedCount={savedCount}
        planInProgress={planInProgress}
      />
    </div>

    {authConfigured && authModalOpen && (
      <AuthModal initialMode={authModalMode} onClose={() => setAuthModalOpen(false)} />
    )}
    {togetherCode && (
      <div onClick={(e) => e.stopPropagation()}>
        <Suspense fallback={null}>
          <TogetherSheet code={togetherCode} onClose={() => setTogetherCode(null)} />
        </Suspense>
      </div>
    )}
    {savedTripsOpen && (
      <div onClick={(e) => e.stopPropagation()}>
        <Suspense fallback={<div className="mt-loading" aria-busy="true" />}>
        <SavedTripsPanel
          data={data}
          startWithPast={pastAtOpen}
          onPastStarted={() => setPastAtOpen(false)}
          onClose={closeOverlay}
          onLoadTrip={(trip) => {
            handleLoadTrip(trip);
            goToTab('map'); // the loaded trip opens as a map detail panel
          }}
          /* Signing in from My trips keeps My trips open behind the modal
             (T390-b), so the traveller is back on the shelf, not on the
             tab under it, once they are in. */
          onOpenAuth={() => { setAuthModalMode('signin'); setAuthModalOpen(true); }}
          /* The day cost of every saved place and plan, from the same
             computeCosts() map Explore's cards print from (T390-a), and
             friends' trips as one line pointing at Friends. */
          costs={exploreIndices}
          stayTier={choices.stay_tier || 'home'}
          lifestyle={choices.lifestyle}
          onPlanTripCountry={openTripForCountry}
          onOpenFriends={() => openTogether('home')}
          /* An empty shelf offers the tab that fills it, so "nothing here
             yet" comes with somewhere to go. */
          onGoToTab={(key, opts) => {
            // T809 (row T806-b): "Plan this trip" from Kept trips starts a
            // new trip in the list when one with stops is open, so the held
            // plan lands instead of being dropped behind the open trip.
            if (key === 'trip' && heldPlanWaiting() && loadTripDraft()) tripsStore.startNew();
            goToTab(key, opts);
          }}
          onOpenDayPlan={(id) => {
            setPendingDayPlanId(id);
            goToTab('day');
          }}
          onLoadTripPlan={openPlanInList}
          /* T925: "Plan a trip with these" from Saved hands the picked
             places to the trip planner through Explore's own door. */
          onPlanStops={(stops) => openTripInPlanner({ stops })}
          /* The trip kept on this device (T503, T500-a) opens in Plan through
             the same hand-off, marked so the planner reads the device. */
          onOpenDeviceTrip={() => openPlanInList({ device: true })}
          /* The shortlist, which the Favorites tab now shows alongside the
             account's own saved destinations. Opening a row is the same
             door every other surface uses, so a starred trail lands on the
             trail page rather than a second, lesser version of it. */
          favorites={favorites}
          onToggleFav={toggleFav}
          onOpenFeature={(layer, ref) => { setSavedTripsOpen(false); openFeature(layer, ref); }}
          onOpenDest={(id) => { setSavedTripsOpen(false); openDetail(id); }}
        />
        </Suspense>
      </div>
    )}
    {guidesOpen && (
      <Suspense fallback={<TabFallback />}>
        <div onClick={(e) => e.stopPropagation()}>
          <GuidesPanel
            onClose={() => { setGuidesOpen(false); setPendingGuide(''); }}
            destinations={data?.destinations}
            openGuideId={pendingGuide || ''}
            onPublish={() => { setGuidesOpen(false); setPendingGuide(''); openSaved(); }}
          />
        </div>
      </Suspense>
    )}
    {togetherOpen && (
      <div onClick={(e) => e.stopPropagation()}>
        <Suspense fallback={<div className="mt-loading" aria-busy="true" />}>
          <TogetherPage
            view={togetherView.view}
            viewId={togetherView.id}
            onView={(v, id) => openTogether(v, id)}
            onClose={closeOverlay}
            destinations={data?.destinations}
            costs={exploreIndices}
            pendingHandle={pendingFriend}
            onOpenGuides={openGuides}
            onOpenSaved={openSaved}
            onOpenAuth={() => { setAuthModalMode('signin'); setAuthModalOpen(true); }}
            onPlanDay={(destId, date) => openDayForDest(destId, date)}
            onOpenTripPlan={openPlanInList}
            favorites={favorites}
            choices={choices}
            onPlanPlace={(id) => { const d = data?.destinations?.[id]; if (d?.iso2) openTripForCountry(d.iso2, id); }}
          />
        </Suspense>
      </div>
    )}
    {accountOpen && (
      <div onClick={(e) => e.stopPropagation()}>
        <AccountPanel
          key={accountEntry}
          initialView={accountView}
          onViewChange={onAccountView}
          pendingFriendHandle={pendingFriend}
          destinations={data?.destinations}
          costs={exploreIndices}
          favorites={favorites}
          onClose={closeOverlay}
          onOpenAdmin={() => setAdminOpen(true)}
          /* Lifestyle is a dialog: it opens over Account, which stays the
             place on screen (and in the address) behind it. */
          onOpenLifestyle={() => setLifestyleOpen(true)}
          onOpenSaved={openSaved}
          onOpenGuides={openGuides}
          onOpenTogether={(v) => openTogether(v || 'home')}
          onOpenHome={() => goToTab('home')}
          stayTier={choices.stay_tier || 'home'}
          lifestyle={choices.lifestyle}
          /* For the read-only trip settings rows (T390-g, for T400). */
          origin={choices.origin}
          groupSize={choices.group_size}
          /* Signing in keeps Account open behind the dialog, so the
             traveller is back on Account once they are in. */
          onOpenAuth={() => { setAuthModalMode('signin'); setAuthModalOpen(true); }}
        />
      </div>
    )}

    {/* The back office, over everything. It renders only for accounts on
        the admin list, and every call it makes is re-checked server side,
        so this flag is a door rather than a permission. */}
    {adminOpen && (
      <Suspense fallback={<TabFallback />}>
        <div onClick={(e) => e.stopPropagation()}>
          <AdminPage onClose={() => setAdminOpen(false)} />
        </div>
      </Suspense>
    )}
    </>
  );
}
