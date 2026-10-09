/**
 * Arrow keys for a radio group built from buttons (T410, brief V5-4).
 *
 * Put `onKeyDown={onRadioKeys}` on the element that carries role="radiogroup"
 * and `tabIndex={checked ? 0 : -1}` on each role="radio" (or "option") button, so Tab enters
 * the group once and the arrows walk it. Moving to a radio selects it, as a
 * native radio group does; Home and End jump to the ends.
 */
export function onRadioKeys(e) {
  const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];
  if (!keys.includes(e.key)) return;
  const radios = [...e.currentTarget.querySelectorAll('[role="radio"]:not(:disabled), [role="option"]:not(:disabled)')];
  if (!radios.length) return;
  const at = radios.indexOf(document.activeElement);
  let next;
  if (e.key === 'Home') next = 0;
  else if (e.key === 'End') next = radios.length - 1;
  else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (at + 1) % radios.length;
  else next = (at - 1 + radios.length) % radios.length;
  e.preventDefault();
  radios[next].focus();
  // A group whose choice has consequences (publishing) moves focus only; the
  // choice itself waits for Enter or Space.
  if (e.currentTarget.dataset.arrowSelect !== 'false') radios[next].click();
}
