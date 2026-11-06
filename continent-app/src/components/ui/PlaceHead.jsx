/*
 * PlaceHead (T1121, roadmap G2): the head every place-like page opens with,
 * built once. Before this it was written out three times, in DestinationPage
 * (T1024), OutdoorParts' item page template (T1039) and JourneyPage. The
 * markup and class names are theirs (88-place-template.css), unchanged.
 *
 *   <header class="pt-head">
 *     <h1 class="pt-title">           the name, focusable for the page's focus move
 *     <p class="pt-subtitle">         optional second name line
 *     <div class="pt-meta">           where (flag and country) and the Score, one line
 *     <ul class="pt-tags">            the standing as small tags (PlaceTag)
 *     children                        anything a page adds under it (match line, badges, lead)
 *
 * Props
 *   title, sub        the name and the optional subtitle
 *   where, iso2       the "where" label and the flag's country (no flag without iso2)
 *   whereLine         the older journey layout: "where" as its own line, no meta row
 *   score             the Score node (a button, link or span around ScoreChip)
 *   tags              <li> nodes, usually PlaceTag; the list hides when empty
 *   headRef, titleRef refs on the header and on the title
 */
import React from 'react';
import { CountryFlag } from '../CountryFlag.jsx';

/* One standing tag in the place head: a rank ("Top of Italy") or UNESCO. */
export function PlaceTag({ tone = 'rank', title, children }) {
  return <li className={`pt-tag is-${tone === 'unesco' ? 'unesco' : 'rank'}`} title={title}>{children}</li>;
}

function Where({ where, iso2, line = false }) {
  const inner = (
    <>
      {iso2 && <CountryFlag country={iso2} size={15} />}
      <span>{where}</span>
    </>
  );
  return line ? <p className="pt-where">{inner}</p> : <span className="pt-where">{inner}</span>;
}

export function PlaceHead({
  title, sub = null, where = null, iso2 = null, whereLine = false, score = null, tags = [],
  headRef, titleRef, children,
}) {
  const list = (tags || []).filter(Boolean);
  return (
    <header className="pt-head" ref={headRef}>
      <h1 className="pt-title" ref={titleRef} tabIndex={-1}>{title}</h1>
      {sub && <p className="pt-subtitle">{sub}</p>}
      {whereLine
        ? where && <Where where={where} iso2={iso2} line />
        : (where || score) && (
          <div className="pt-meta">
            {where && <Where where={where} iso2={iso2} />}
            {score}
          </div>
        )}
      {list.length > 0 && <ul className="pt-tags">{list}</ul>}
      {children}
    </header>
  );
}
