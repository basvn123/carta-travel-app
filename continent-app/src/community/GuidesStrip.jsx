import React, { useEffect, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { CompassIcon } from '../components/Icons.jsx';
import { listGuides } from './guides.js';

/**
 * GuidesStrip, the door to the published guides, on a browse surface.
 *
 * It sits on Explore rather than in the account panel because that is where
 * somebody is when they are looking for somewhere to go, and because the
 * whole point of a gallery keyed on documents is that it works for an account
 * with no friends. A door buried behind Account > Friends would only ever be
 * found by people who already have some.
 *
 * ONE REAL NUMBER AND ONE ACTION. The count is the number of guides that
 * actually exist, which is a fact the product can defend if anybody asks, and
 * it is set in mono like every other measured figure. There is no carousel of
 * preview cards here: those would push the priced destinations, which are the
 * reason this tab exists, below the fold for a feature that is new.
 *
 * When nothing is published the strip is ABSENT rather than empty. An empty
 * shelf on somebody else's browse page is not an invitation, it is a notice
 * that a feature is not working yet.
 */
export function GuidesStrip({ onOpen }) {
  const { t } = useI18n();
  const [count, setCount] = useState(0);

  useEffect(() => {
    let live = true;
    // The list is capped anyway, and the strip only needs to know whether
    // there is anything to open, so this is the same cheap call the gallery
    // makes and nothing extra.
    listGuides({ limit: 60 })
      .then((rows) => { if (live) setCount(rows.length); })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  if (!count || !onOpen) return null;

  return (
    <div className="gld-strip">
      <span className="gld-strip-icon" aria-hidden="true"><CompassIcon size={16} /></span>
      <p className="gld-strip-text">
        {count === 1
          ? t('guides.stripOne')
          : <>
            <span className="gld-strip-n">{count}</span>
            {' '}
            {t('guides.stripMany')}
          </>}
      </p>
      <button type="button" className="gld-strip-btn" onClick={onOpen}>
        {t('guides.seeAll')}
      </button>
    </div>
  );
}
