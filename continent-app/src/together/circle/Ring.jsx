import React from 'react';
import { HeroImage } from '../../components/HeroImage.jsx';
import { ToneFace } from '../parts.jsx';

/**
 * The kring ring (G16, decision 0017): the leading proposal's photo in a
 * circle with the member faces placed around it. Static on purpose: a
 * figure moves only when the traveller changes it, so the faces never spin.
 * Decorative; the card or head around it names the kring and its members.
 */
export function Ring({ photo = null, members = [], me, big = false }) {
  const n = Math.max(1, members.length);
  const shown = members.slice(0, 8);
  return (
    <span className={`vr-ring${big ? ' is-big' : ''}`} aria-hidden="true">
      <span className="vr-ring-c">
        {photo?.image?.url ? (
          <HeroImage url={photo.image.url} image={photo.image} className="vr-ring-img" maxWidth={big ? 640 : 320}
            sizes={big ? '320px' : '180px'} ratio={[1, 1]} />
        ) : <span className="vr-ring-blank" />}
      </span>
      {shown.map((m, i) => {
        const a = (i / Math.min(n, 8)) * Math.PI * 2 - Math.PI / 2;
        // Percent positions on the ring's own box, so the ring scales. The
        // faces sit on an orbit outside the photo (judge 1 fix 4): the orbit
        // radius minus half a face clears the photo's edge, whose inset is
        // set to match in 91-vrienden.css (.vr-ring-c).
        const r = big ? 39.75 : 37.5;
        const style = { left: `${50 + Math.cos(a) * r}%`, top: `${50 + Math.sin(a) * r}%` };
        return (
          <span key={m.userId} className="vr-ring-face" style={style}>
            <ToneFace id={m.userId} me={me} name={m.name} emoji={m.emoji} size="sm" />
          </span>
        );
      })}
    </span>
  );
}
