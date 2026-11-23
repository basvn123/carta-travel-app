/**
 * openVrienden.js, one door into Vrienden from anywhere in the app (G16,
 * decision 0017, build-spec block 6). A surface that shows a friend's face
 * (the place page's "Friends here") asks App to open that friend's page,
 * without a prop handed down through every screen in between. App listens
 * once and calls openTogether(view, id).
 */
export const OPEN_VRIENDEN = 'carta:open-vrienden';

export function openVrienden(view = 'home', id = '') {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OPEN_VRIENDEN, { detail: { view, id } }));
}

export const openFriend = (userId) => openVrienden('friend', userId);
