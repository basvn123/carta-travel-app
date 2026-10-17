import React from 'react';
import { initialsOf } from './useFriendTrips.js';

/**
 * A friend's face (T466): the emoji they picked (migration 010 allows an
 * emoji, never a photograph, so nothing here needs moderating), or the
 * initials of their name on the sunken ground, the same disc the account
 * hub draws for you. Decorative: the name beside it is the label.
 *
 *   Face       { name, emoji, size: 'sm' | 'md' | 'lg' }
 *   FaceStack  { people: [{ id, name, emoji }], max } overlapping discs and
 *              a "+n" disc for the rest
 */
export function Face({ name, emoji = '', size = 'md', className = '' }) {
  return (
    <span className={`frn-face frn-face-${size} ${className}`.trim()} aria-hidden="true">
      {emoji || initialsOf(name)}
    </span>
  );
}

export function FaceStack({ people = [], max = 3, size = 'sm' }) {
  if (!people.length) return null;
  const shown = people.slice(0, max);
  return (
    <span className="frn-stack" aria-hidden="true">
      {shown.map((p) => <Face key={p.id || p.name} name={p.name} emoji={p.emoji} size={size} />)}
      {people.length > shown.length && (
        <span className={`frn-face frn-face-${size} is-more`}>+{people.length - shown.length}</span>
      )}
    </span>
  );
}
