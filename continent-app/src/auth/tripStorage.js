import { supabase } from '../lib/supabaseClient.js';

export async function fetchSavedTrips(userId) {
  const { data, error } = await supabase
    .from('saved_trips')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function saveTrip(userId, trip) {
  const { error } = await supabase.from('saved_trips').insert({
    user_id: userId,
    destination_id: trip.destinationId,
    city: trip.city,
    country: trip.country,
    depart_date: trip.departDate,
    return_date: trip.returnDate,
    choices: trip.choices,
    label: trip.label || null,
  });
  if (error) throw error;
}

export async function deleteTrip(id) {
  const { error } = await supabase.from('saved_trips').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchUserSettings(userId) {
  const { data, error } = await supabase
    .from('user_settings')
    .select('settings')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data?.settings || null;
}

export async function saveUserSettings(userId, settings) {
  const { error } = await supabase
    .from('user_settings')
    .upsert({ user_id: userId, settings, updated_at: new Date().toISOString() });
  if (error) throw error;
}
