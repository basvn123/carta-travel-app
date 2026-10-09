import React from 'react';
import { SunIcon } from '../components/Icons.jsx';
import { pointWord, kmFigure } from '../lib/derivedModules.js';

/**
 * The bodies of the derived-module rows (T182, destinations spec 11.5). The
 * rules that decide what each one says live in lib/derivedModules.js; these
 * components only lay the answer out. Each page puts them into its rows array
 * (DetailSkeleton.jsx slot 6) as one more { key, icon, label, summary, body }.
 *
 * House rules kept here: icons are 20px with no tile, figures are mono and
 * sentences are the sans, colour comes from tokens in
 * styles/29-derived-modules.css, and every module that cannot answer says so
 * in a sentence rather than drawing an empty frame.
 */

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

/* ── Beach orientation (8.4) ── */

/** A point on the rose's circle, `deg` clockwise from north. */
function onCircle(deg, r, c = 24) {
  const a = (deg * Math.PI) / 180;
  return [c + r * Math.sin(a), c - r * Math.cos(a)];
}

/**
 * The compass rosette: a ring, a north tick and one filled wedge, 45 degrees
 * wide, centred on the bearing out to sea. Drawn at 48px so the wedge reads
 * on a phone; the spec's 24px is the card size.
 */
export function FacingRose({ aspect, label }) {
  const r = 19;
  const [x1, y1] = onCircle(aspect - 22.5, r);
  const [x2, y2] = onCircle(aspect + 22.5, r);
  const wedge = `M24 24 L${x1.toFixed(2)} ${y1.toFixed(2)} A${r} ${r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
  return (
    <svg className="dmod-rose" width="48" height="48" viewBox="0 0 48 48" role="img" aria-label={label}>
      <circle className="dmod-rose-ring" cx="24" cy="24" r={r} />
      <path className="dmod-rose-wedge" d={wedge} />
      <path className="dmod-rose-north" d="M24 2.5v5" />
      <circle className="dmod-rose-hub" cx="24" cy="24" r="1.6" />
    </svg>
  );
}

export function BeachFacing({ facing, t }) {
  if (facing.state !== 'measured') {
    return (
      <div className="dmod dmod-empty">
        <p>{t(facing.state === 'inland' ? 'derived.facingInland' : 'derived.facingNone')}</p>
      </div>
    );
  }
  const point = pointWord(facing.point, t);
  return (
    <div className="dmod dmod-facing">
      <div className="dmod-facing-glyph">
        <FacingRose aspect={facing.aspect} label={t('derived.facingAria', { point, deg: facing.aspect })} />
        {facing.sun === 'sunset' && <SunIcon size={20} className="dmod-sun" />}
      </div>
      <div className="dmod-facing-text">
        <p className="dmod-lead">
          {t('derived.facingLine', { point })}
          {' '}
          <span className="mono">{`${facing.aspect}°`}</span>
        </p>
        <p>{t(`derived.sun${cap(facing.sun)}`)}</p>
        <p className="dmod-src">{t('derived.facingSrc')}</p>
      </div>
    </div>
  );
}

/* ── Beach walk-in (8.5) ── */

export function BeachWalkIn({ walkIn, t }) {
  return (
    <div className={`dmod ${walkIn.state === 'none' ? 'dmod-empty' : ''}`}>
      {walkIn.state === 'access' && (
        <p className="dmod-lead">
          {t(`derived.walkin${cap(walkIn.access)}`)}
          {' '}
          {t('derived.walkinFromArticle')}
        </p>
      )}
      {(walkIn.state === 'parking' || walkIn.parking) && <p>{t('derived.walkinParking')}</p>}
      {walkIn.state === 'none' && <p>{t('derived.walkinNone')}</p>}
      <p className="dmod-src">{t('derived.walkinUnmeasured')}</p>
    </div>
  );
}

/* The four-slot "how you get up" picture went in T406: since T386 the mountain
   page states the way up in its own block (MountainPage.jsx WayUp).
   lib/derivedModules.js mountainWayUp and wayUpSummary stay, tested, for the
   coverage count of the T182 report. */

/* ── Lake shore walkability (9.5) ── */

export function LakeShore({ shore, t, lang }) {
  if (shore.state === 'unswept' || shore.state === 'cut') {
    return (
      <div className="dmod dmod-empty">
        <p>{t(shore.state === 'cut' ? 'derived.shoreCut' : 'derived.shoreUnswept')}</p>
      </div>
    );
  }
  return (
    <div className="dmod dmod-shore">
      {shore.state === 'path' ? (
        <p className="dmod-lead">{t('derived.shorePath', { km: kmFigure(shore.km, lang) })}</p>
      ) : (
        <>
          <p className="dmod-lead">{t('derived.shoreShort')}</p>
          {shore.private && <p>{t('lake.whyPrivateShore')}</p>}
          {shore.launch && <p>{t('lake.whyShoreLaunch')}</p>}
        </>
      )}
      {shore.minKm != null && (
        <p>{t('derived.shoreMin', { km: kmFigure(shore.minKm, lang) })}</p>
      )}
      <p className="dmod-src">{t('derived.shoreShare')}</p>
      <p className="dmod-src">{t('derived.shoreSrc')}</p>
    </div>
  );
}
