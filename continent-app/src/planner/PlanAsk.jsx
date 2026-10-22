
/**
 * Ask Carta on the Plan start page (T558; T574), retired by T595: the owner
 * wants Ask Carta only on Explore (2026-10-22), so the Plan page draws no
 * door. The component stays, rendering nothing, so App's `ask` prop needs
 * no change; the one chat is still hosted by Explore and opened from its
 * overview.
 */
export function PlanAsk() {
  return null;
}
