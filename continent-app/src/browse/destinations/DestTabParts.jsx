import { countryPhotos } from '../../lib/countryGallery.js';
import CreditFold from '../CreditFold.jsx';
import { ErrorBlock } from '../../components/StateBlocks.jsx';

/**
 * A layer that could not be LOADED, as opposed to one with nothing published.
 *
 * The distinction is the whole point: "nothing here matches" is a claim about
 * the catalogue and it was being made on the strength of a dropped request.
 * This says what actually happened and offers the way back, in the tone the
 * geolocation failure already uses: no blame, one button.
 */
/**
 * Where everything on the section comes from, in one closed row at its end
 * (T428). The credit sentences used to sit under every list with a coverage
 * footer beside them; the owner asked for no text the traveller does not
 * need, and a licence still has to be honoured, so the words wait here: the
 * section's data credit, then every photograph on screen that is not a
 * place's own (the section's head, the country galleries), each with its
 * author, licence and file page.
 */
const SECTION_CREDIT = {
  trails: ['trails.credit'],
  beaches: ['beach.credit'],
  lakes: ['lake.credit'],
  mountains: ['mtn.credit'],
  cycling: ['cycle.sourceNote', 'credit.licence.cycle'],
};

function PhotoCredit({ p }) {
  return (
    <li>
      {p.place}: <a href={p.page} target="_blank" rel="noreferrer">{p.author}</a>, {p.licence}
    </li>
  );
}

export function SourcesFold({ cat, isComposedTrips, sectionHead, countries, t }) {
  const keys = cat === 'trips'
    ? [isComposedTrips ? 'trip.credit' : 'journey.credit']
    : (SECTION_CREDIT[cat] || []);
  const photos = [];
  if (sectionHead?.photo) photos.push(sectionHead.photo);
  for (const cc of countries || []) photos.push(...countryPhotos(cc));
  if (!keys.length && !photos.length) return null;
  return (
    <div className="dtab-sources">
      <CreditFold t={t} licenceKeys={keys}>
        {photos.length > 0 && (
          <>
            <p className="dtab-sources-head">{t('dtab.photoCredits')}</p>
            <ul className="dtab-sources-list">
              {photos.map((p) => <PhotoCredit key={p.u} p={p} />)}
            </ul>
          </>
        )}
      </CreditFold>
    </div>
  );
}

export function LayerError({ onRetry, t, msg = 'layer.loadFailed' }) {
  return (
    <div className="places-empty places-loaderr" role="status">
      <ErrorBlock message={t(msg)} onRetry={onRetry} retryLabel={t('layer.retry')} />
    </div>
  );
}
