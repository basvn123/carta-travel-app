/**
 * Open My trips on one shared list (G16, judge 1 fix 7): Vrienden's Gedeeld
 * names a list, and the press should land on that list in Bewaard, not on
 * "All saved". My trips remembers its tab under carta.savedTripsTab (the
 * precedent is keptStore.js showKeptNext); the list waits in this tab's
 * session storage until Saved mounts and takes it.
 */
const TAB_KEY = 'carta.savedTripsTab';
const LIST_KEY = 'carta.savedList';

export function requestSavedList(listId) {
  try {
    localStorage.setItem(TAB_KEY, 'saved');
    if (listId) sessionStorage.setItem(LIST_KEY, `sh:${listId}`);
  } catch { /* private mode: My trips opens where it was */ }
}

/** The list a door asked for ('sh:<id>'), once; null when none waits. */
export function takeSavedList() {
  try {
    const v = sessionStorage.getItem(LIST_KEY);
    if (v) sessionStorage.removeItem(LIST_KEY);
    return v && /^sh:[\w-]{1,64}$/.test(v) ? v : null;
  } catch { return null; }
}
