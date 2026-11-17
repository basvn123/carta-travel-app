import React from 'react';

/**
 * The boxed "AI" tag (house style, DESIGN.md "The kit"): what stands for
 * AI, never a sparkle. Decorative: the control or line beside it names the
 * thing, so the tag is hidden from screen readers. It takes the same props as
 * an icon component (`size`, `className`) so it can stand where an icon
 * component is expected (an Account row, a chip). Kit part since K12
 * (account FR1); components/AiTag.jsx re-exports it for older importers.
 */
export function AiTag({ className = '' }) {
  return <span className={`ai-tag ${className}`.trim()} aria-hidden="true">AI</span>;
}

export default AiTag;
