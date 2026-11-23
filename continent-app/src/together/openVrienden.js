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

/* The draw-in rule (G16): has the traveller pressed or typed anything since
 * this page loaded? Listened for from the first module load (App imports
 * this file eagerly), because the press that opens Vrienden comes before the
 * page's own lazy chunk. navigator.userActivation is not used: headless
 * Chromium reports it as active without any input. */
let acted = false;
if (typeof window !== 'undefined') {
  const mark = () => { acted = true; };
  window.addEventListener('pointerdown', mark, { capture: true, once: true });
  window.addEventListener('keydown', mark, { capture: true, once: true });
}
export const hasActed = () => acted;
