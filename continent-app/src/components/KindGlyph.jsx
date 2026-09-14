import React from 'react';

/**
 * The five kind glyphs (PLAN.md C3): what a place IS, drawn as ink weight.
 *
 * metro = filled square, city = rounded square, town = circle,
 * village = small dot, area = triangle. Decreasing ink density (the
 * --kind-* tokens), so the ramp reads as scale and survives greyscale and
 * colour-blind viewing - never colour alone. Inline SVG per the app's
 * SVG-only icon rule; every glyph carries its kind as an accessible label,
 * with the visible kind word usually printed right beside it.
 */

const SHAPES = {
  metro: (
    <rect x="4" y="4" width="16" height="16" fill="var(--kind-metro)" />
  ),
  city: (
    <rect x="5" y="5" width="14" height="14" rx="4" fill="var(--kind-city)" />
  ),
  town: <circle cx="12" cy="12" r="7" fill="var(--kind-town)" />,
  village: <circle cx="12" cy="12" r="4.5" fill="var(--kind-village)" />,
  area: (
    <polygon points="12 4.5 20.5 19.5 3.5 19.5" fill="var(--kind-area)" />
  ),
};

export function KindGlyph({ kind, size = 12, label }) {
  return (
    <svg
      className={`kind-glyph kind-glyph--${kind}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label={label || kind}
    >
      {SHAPES[kind] || SHAPES.city}
    </svg>
  );
}
