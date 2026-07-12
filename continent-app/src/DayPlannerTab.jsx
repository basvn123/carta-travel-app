import React from 'react';

// Placeholder for the day-by-day activity planner (Phase 5, blocked on the
// OpenTripMap data upgrade). Wired up as its own top-level tab now so the
// shell/navigation can be verified before the real day-by-day view lands.
export function DayPlannerTab() {
  return (
    <div className="tab-panel tab-panel-placeholder">
      <div className="tab-panel-placeholder-inner">
        <div className="section-title">Day planner</div>
        <p>
          Day-by-day things to do for each stop on your trip - coming soon.
        </p>
      </div>
    </div>
  );
}
