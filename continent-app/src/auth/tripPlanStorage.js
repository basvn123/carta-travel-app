import { supabase } from '../lib/supabaseClient.js';

export async function fetchTripPlans(userId) {
  const { data, error } = await supabase
    .from('trip_plans')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const plans = data || [];
  if (!plans.length) return plans;
  // Summarize each plan's CURRENT stops (dates + route) so lists show the
  // real, up-to-date trip window - including any date changes saved later.
  const { data: stops } = await supabase
    .from('trip_plan_stops')
    .select('trip_plan_id, arrive_date, depart_date, city, country, position')
    .in('trip_plan_id', plans.map((p) => p.id))
    .order('position', { ascending: true });
  const byPlan = {};
  (stops || []).forEach((s) => { (byPlan[s.trip_plan_id] = byPlan[s.trip_plan_id] || []).push(s); });
  return plans.map((p) => {
    const ss = byPlan[p.id] || [];
    return {
      ...p,
      start_date: ss[0]?.arrive_date || null,
      end_date: ss.length ? ss[ss.length - 1].depart_date : null,
      cities: ss.map((s) => s.city).filter(Boolean),
      countries: [...new Set(ss.map((s) => s.country).filter(Boolean))],
    };
  });
}

export async function fetchTripPlanWithStops(tripPlanId) {
  const [{ data: plan, error: planError }, { data: stops, error: stopsError }] = await Promise.all([
    supabase.from('trip_plans').select('*').eq('id', tripPlanId).single(),
    supabase.from('trip_plan_stops').select('*').eq('trip_plan_id', tripPlanId).order('position', { ascending: true }),
  ]);
  if (planError) throw planError;
  if (stopsError) throw stopsError;
  return { ...plan, stops };
}

export async function createTripPlan(userId, label) {
  const { data, error } = await supabase
    .from('trip_plans')
    .insert({ user_id: userId, label: label || null })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function renameTripPlan(id, label) {
  const { error } = await supabase
    .from('trip_plans')
    .update({ label, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteTripPlan(id) {
  const { error } = await supabase.from('trip_plans').delete().eq('id', id);
  if (error) throw error;
}

// Replaces the full stop list for a trip plan. Trip plans have only a
// handful of stops, so delete-and-reinsert is simpler and cheap - no need
// for granular per-stop update plumbing.
export async function saveTripPlanStops(tripPlanId, userId, stops) {
  const { error: deleteError } = await supabase
    .from('trip_plan_stops')
    .delete()
    .eq('trip_plan_id', tripPlanId);
  if (deleteError) throw deleteError;

  if (!stops.length) return;

  const rows = stops.map((stop, index) => ({
    trip_plan_id: tripPlanId,
    user_id: userId,
    position: index,
    destination_id: stop.destinationId,
    city: stop.city,
    country: stop.country,
    arrive_date: stop.arriveDate,
    depart_date: stop.departDate,
    transport_mode: stop.transportMode || null,
    transport_notes: stop.transportNotes || null,
    choices: stop.choices || {},
  }));

  const { error: insertError } = await supabase.from('trip_plan_stops').insert(rows);
  if (insertError) throw insertError;

  const { error: touchError } = await supabase
    .from('trip_plans')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', tripPlanId);
  if (touchError) throw touchError;
}
