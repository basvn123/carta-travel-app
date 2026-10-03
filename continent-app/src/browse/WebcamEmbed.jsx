import React from 'react';
import { CameraIcon } from '../components/Icons.jsx';
import { Fold } from './Fold.jsx';

/**
 * Live webcam views on the destination page.
 *
 * The frame is the provider's own player in an iframe, so the picture always
 * comes straight from their server and Carta never fetches, stores or caches a
 * frame. Storing one would turn a free feature into a licence question.
 *
 * Only foto-webcam.eu is wired. Its terms (checked 2026-10-03, see
 * Execution/P8/T142-webcam-embeds.md) allow the iframe player on any site when
 * the source "www.foto-webcam.eu" is legible and a clickable link. Panomax and
 * Roundshot are left out on purpose: neither publishes terms or an embed
 * address for a third party, and both send X-Frame-Options headers on the
 * hosts the old code assumed. Adding either needs written permission first,
 * then its host in frame-src (public/_headers and vercel.json).
 *
 * Embed address, from https://www.foto-webcam.eu/webcam/iframe/?wc=ewa :
 *   https://www.foto-webcam.eu/webcam/{id}/?frame=1
 * The player is 9/16 of its width plus 95 px of controls, 145 px when the
 * frame is narrower than 450 px; styles.css does that sum in CSS.
 */

const SOURCE_NAME = 'www.foto-webcam.eu';
const ID_OK = /^[a-z0-9_-]+$/i;

function WebcamCard({ webcam, t }) {
  const { provider, id, label, location } = webcam;
  if (provider !== 'fotowebcam' || !ID_OK.test(String(id || ''))) return null;
  const name = label || location || id;
  const pageUrl = `https://www.foto-webcam.eu/webcam/${id}/`;

  return (
    <div className="webcam-card">
      <h3 className="webcam-label">{name}</h3>
      {location && label && <p className="webcam-location">{location}</p>}
      <div className="webcam-frame-wrap">
        <iframe
          src={`${pageUrl}?frame=1`}
          title={t('dest.webcamFrameTitle', { name })}
          className="webcam-frame"
          loading="lazy"
          allowFullScreen
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="strict-origin"
        />
      </div>
      <p className="webcam-credit">
        {t('dest.webcamFrom')}{' '}
        <a href={pageUrl} target="_blank" rel="noopener noreferrer">{SOURCE_NAME}</a>
      </p>
    </div>
  );
}

/**
 * Props: webcams is an array of { provider, id, label, location }, from
 * dossier.webcams. Renders nothing when no entry is usable.
 */
export function WebcamSection({
  webcams, open, onToggle, t,
}) {
  const usable = (webcams || []).filter(
    (w) => w && w.provider === 'fotowebcam' && ID_OK.test(String(w.id || '')),
  );
  if (usable.length === 0) return null;

  return (
    <Fold
      id="sec-webcams"
      icon={CameraIcon}
      title={t('dest.webcamTitle')}
      summary={t('dest.webcamSummary', { n: usable.length })}
      open={open}
      onToggle={onToggle}
    >
      <div className="webcams-grid">
        {usable.map((webcam) => (
          <WebcamCard key={`${webcam.provider}-${webcam.id}`} webcam={webcam} t={t} />
        ))}
      </div>
      <p className="webcam-note">{t('dest.webcamNote')}</p>
    </Fold>
  );
}

export default WebcamSection;
