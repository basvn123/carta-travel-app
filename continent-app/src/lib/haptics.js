// Haptics (G1, G5; house style 2026-11, DESIGN.md "Interaction"): one short,
// optional tick, confirm or warn on a touch COMMIT. Never on pointerdown (a
// scroll that starts on a control would buzz), never on navigation, opening a
// sheet, scrolling, load or a timer.
//
// Android and a Play Store TWA use navigator.vibrate; a Capacitor build uses
// its Haptics plugin from window.Capacitor (no import, so the web bundle does
// not carry it); iOS Safari gets the switch control's own tick where WebKit
// still plays it (iOS 17.4 to 26.4). Everywhere else a silent no-op.
//
// The traveller's choice lives in Settings ("Vibrate on tap"): 'on', 'off' or
// absent (on, except off when the system asks for reduced motion). An explicit
// choice wins both ways: a vibration is not visual motion.
import { prefersReducedMotion } from './motion.js';

const PATTERN = { tick: 10, confirm: [10, 60, 14], warn: [20, 80, 20] };
const GAP_MS = 50; // two ticks closer than this smear into a buzz
export const HAPTICS_KEY = 'carta.haptics.v1';

let backend = null; // 'native' | 'vibrate' | 'switch' | 'none'
let lastAt = -Infinity;
let lastInput = 'none';
let iosLabel = null;
const listeners = new Set();

/** Start tracking the last input type (once, from main.jsx). */
export function installHaptics() {
  if (typeof window === 'undefined') return;
  window.addEventListener('pointerdown', (e) => { lastInput = e.pointerType || 'mouse'; },
    { capture: true, passive: true });
  window.addEventListener('keydown', () => { lastInput = 'key'; }, { capture: true, passive: true });
}

/** 'on' | 'off' | 'auto' (no choice made on this device). */
export function hapticsSetting() {
  try {
    const v = localStorage.getItem(HAPTICS_KEY);
    if (v === 'on' || v === 'off') return v;
  } catch { /* storage blocked: the default applies */ }
  return 'auto';
}

export function setHapticsSetting(v) {
  try {
    if (v === 'auto') localStorage.removeItem(HAPTICS_KEY);
    else localStorage.setItem(HAPTICS_KEY, v);
  } catch { /* storage blocked */ }
  listeners.forEach((fn) => fn(v));
}

/** Re-render on a setting change (the Settings switch reads this). */
export function onHapticsSetting(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function resolveBackend() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'none';
  const cap = window.Capacitor;
  if (cap?.isNativePlatform?.() && cap.Plugins?.Haptics) return 'native';
  if (typeof navigator.vibrate === 'function') return 'vibrate';
  const iOS = /iP(hone|od|ad)/.test(navigator.userAgent || '')
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (iOS && typeof HTMLInputElement !== 'undefined' && 'switch' in HTMLInputElement.prototype) return 'switch';
  return 'none';
}

/** Whether this device has any route to a haptic: the setting shows only then. */
export function hapticsAvailable() {
  backend ??= resolveBackend();
  return backend !== 'none';
}

/** Whether a haptic would play now: available and allowed by the setting. */
export function hapticsOn() {
  const s = hapticsSetting();
  return s === 'on' || (s === 'auto' && !prefersReducedMotion());
}

function iosToggle() {
  if (!iosLabel) {
    // A hidden switch whose own toggle iOS answers with its system tick. The
    // label hides it with a class (02-base.css), never an inline style: the
    // CSP refuses those. Out of the tab order and the accessibility tree.
    iosLabel = document.createElement('label');
    iosLabel.className = 'haptic-switch';
    iosLabel.setAttribute('aria-hidden', 'true');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    input.tabIndex = -1;
    iosLabel.append(input);
    document.body.append(iosLabel);
  }
  iosLabel.click();
}

/**
 * One haptic for a touch commit. Call it synchronously in the click or
 * change handler, after the visible state is set; never from pointerdown, a
 * timer or after an await.
 * @param {'tick'|'confirm'|'warn'} kind
 */
export function haptic(kind = 'tick') {
  if (lastInput !== 'touch') return;
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
  if (!hapticsOn()) return;
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (now - lastAt < GAP_MS) return;
  lastAt = now;
  backend ??= resolveBackend();
  try {
    if (backend === 'vibrate') navigator.vibrate(PATTERN[kind] ?? PATTERN.tick);
    else if (backend === 'switch') { if (kind !== 'warn') iosToggle(); }
    else if (backend === 'native') {
      const H = window.Capacitor.Plugins.Haptics;
      if (kind === 'tick') H.impact({ style: 'LIGHT' });
      else H.notification({ type: kind === 'confirm' ? 'SUCCESS' : 'ERROR' });
    }
  } catch { /* a blocked or missing engine is never an error */ }
}

/** Ticks for a drag through values (a slider, a reorder): start, each step, end. */
export function hapticDrag(phase) {
  if (lastInput !== 'touch' || !hapticsOn()) return;
  backend ??= resolveBackend();
  try {
    if (backend === 'native') {
      const H = window.Capacitor.Plugins.Haptics;
      if (phase === 'start') H.selectionStart();
      else if (phase === 'step') H.selectionChanged();
      else H.selectionEnd();
    } else if (phase === 'step') {
      haptic('tick');
    }
  } catch { /* ignore */ }
}

/** Test seam: forget the backend, the gap and the last input. */
export function _resetHapticsForTest({ input = 'none', be = null } = {}) {
  backend = be;
  lastAt = -Infinity;
  lastInput = input;
}
