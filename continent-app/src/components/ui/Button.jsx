/*
 * Button, the one shared button (T335, extended for Lagoon in T422).
 *
 * Provenance: read from shadcn/ui, "Button" (https://ui.shadcn.com/docs/components/button),
 * read 2026-10-03, MIT licence. Taken: one component with a few named variants
 * and sizes, native <button> semantics, a default type of "button" so it never
 * submits a form by accident, and every other prop passed through. Left behind:
 * Tailwind, class-variance-authority, Radix Slot (asChild), the zinc palette,
 * ring focus and every dark: class. The styling is src/styles/03-button.css.
 *
 * Variants (DESIGN.md, Interaction)
 *   primary    the one action of a view: --action fill
 *   secondary  the default: --surface with a --border edge
 *   quiet      an offer inside a bar or a row: teal text, no fill ("ghost" is an alias)
 *   danger     erases something, nothing else: --danger fill
 * Sizes
 *   md  at least --tap high (default)
 *   sm  inline, inside a bar; 32 px on a fine pointer, --tap on touch
 * Options
 *   loading    keeps the width, shows a spinner, sets aria-busy and blocks clicks
 *   iconStart, iconEnd   an icon node beside the label; hidden from assistive tech
 *   block      fills the width of its container
 *
 * Labels are passed as children by the caller, who owns the i18n key. Verb
 * first, sentence case, no terminal punctuation.
 */
import React from 'react';

const VARIANTS = ['primary', 'secondary', 'quiet', 'danger'];
const SIZES = ['md', 'sm'];

export const Button = React.forwardRef(function Button(
  {
    variant = 'secondary', size = 'md', type = 'button', loading = false, block = false,
    iconStart = null, iconEnd = null, className = '', disabled, onClick, children, ...rest
  },
  ref
) {
  const v = variant === 'ghost' ? 'quiet' : VARIANTS.includes(variant) ? variant : 'secondary';
  const s = SIZES.includes(size) ? size : 'md';
  const cls = ['btn', `btn-${v}`, s === 'sm' && 'btn-sm', block && 'btn-block', loading && 'is-loading', className]
    .filter(Boolean).join(' ');
  return (
    <button
      ref={ref}
      type={type}
      className={cls}
      disabled={disabled}
      aria-busy={loading || undefined}
      onClick={loading ? (e) => e.preventDefault() : onClick}
      {...rest}
    >
      {iconStart && <span className="btn-icon" aria-hidden="true">{iconStart}</span>}
      <span className="btn-label">{children}</span>
      {iconEnd && <span className="btn-icon" aria-hidden="true">{iconEnd}</span>}
      {loading && <span className="btn-spinner" aria-hidden="true" />}
    </button>
  );
});
