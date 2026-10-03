/*
 * Button, the one shared button (T335).
 *
 * Provenance: read from shadcn/ui, "Button" (https://ui.shadcn.com/docs/components/button),
 * read 2026-10-03, MIT licence. Taken: one component with a few named variants
 * and sizes, native <button> semantics, a default type of "button" so it never
 * submits a form by accident, and every other prop passed through. Left behind:
 * Tailwind, class-variance-authority, Radix Slot (asChild), the zinc palette,
 * ring focus and every dark: class. The styling is src/styles/03-button.css,
 * written against the :root tokens under docs/COMPONENT_ROLES.md.
 *
 * Variants
 *   primary    the one action of a view: --accent fill
 *   secondary  the default: --bg-card with a --rule border
 *   ghost      a quiet offer inside a bar or a row: accent text, no fill
 *   danger     erases something, nothing else: --danger fill
 * Sizes
 *   md  at least --tap high (default)
 *   sm  inline, inside a bar; still --tap high on a coarse pointer
 *
 * Labels are passed as children by the caller, who owns the i18n key. Verb
 * first, sentence case, no terminal punctuation. React 18 does not forward
 * ref as a prop, so this is a forwardRef component.
 */
import React from 'react';

const VARIANTS = ['primary', 'secondary', 'ghost', 'danger'];
const SIZES = ['md', 'sm'];

export const Button = React.forwardRef(function Button(
  { variant = 'secondary', size = 'md', type = 'button', className = '', children, ...rest },
  ref
) {
  const v = VARIANTS.includes(variant) ? variant : 'secondary';
  const s = SIZES.includes(size) ? size : 'md';
  const cls = `btn btn-${v}${s === 'sm' ? ' btn-sm' : ''}${className ? ` ${className}` : ''}`;
  return (
    <button ref={ref} type={type} className={cls} {...rest}>
      {children}
    </button>
  );
});
