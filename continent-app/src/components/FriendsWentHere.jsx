import React from 'react';
import { FriendsHere } from '../together/signals.jsx';

/**
 * Friends on a destination page (T466; T929 made it the "Friends here"
 * block): who went, with their tip where they share it (never a cost,
 * T937), who goes, and who saved it. The block itself lives with the other
 * friend signals in src/together/signals.jsx; this file keeps the name the
 * place page imports. Signed out, or with nobody here, it renders nothing.
 *
 * Props
 *   destId        the destination id
 *   destinations  the catalogue, for the trip panel's map and stops
 */
export function FriendsWentHere({ destId, destinations }) {
  return <FriendsHere destId={destId} destinations={destinations} />;
}
