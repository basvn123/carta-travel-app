// Supabase reads and writes for Ask Carta's chats (T575; table ask_chats,
// one row per chat per user, the turns as jsonb, deleted_at a tombstone).
// See supabase/migrations/054_ask_chats.sql. Callers handle errors: a
// project that has not run the migration yet degrades to the device only.
import { getSupabase } from '../lib/supabaseClient.js';

/** True for the error a missing table or an unreloaded schema gives. */
export const missingTable = (err) => ['PGRST205', '42P01', 'PGRST202'].includes(err?.code);

export async function fetchAskChats(userId) {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from('ask_chats')
    .select('chat_id, title, turns, updated_at, deleted_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return data || [];
}

/** Insert or replace one chat, stamped with its own last change. */
export async function upsertAskChat(userId, chat) {
  const supabase = await getSupabase();
  const { error } = await supabase
    .from('ask_chats')
    .upsert({
      user_id: userId,
      chat_id: chat.id,
      title: String(chat.title || '').slice(0, 120),
      turns: chat.turns || [],
      updated_at: new Date(chat.at || Date.now()).toISOString(),
      deleted_at: null,
    }, { onConflict: 'user_id,chat_id' });
  if (error) throw error;
}

/** Delete a chat everywhere: its row keeps only the tombstone. */
export async function deleteAskChat(userId, chatId) {
  const now = new Date().toISOString();
  const supabase = await getSupabase();
  const { error } = await supabase
    .from('ask_chats')
    .upsert({ user_id: userId, chat_id: chatId, title: '', turns: [], updated_at: now, deleted_at: now },
      { onConflict: 'user_id,chat_id' });
  if (error) throw error;
}
