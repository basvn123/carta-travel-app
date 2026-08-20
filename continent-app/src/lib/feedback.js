/**
 * Sending feedback.
 *
 * This used to be a mailto: link, which only worked for people with a mail
 * client configured and left no record at all when it did not. It goes to
 * the database now, through a definer function so the table itself stays
 * closed, and it works signed out because somebody who cannot sign in is
 * exactly the person most likely to need to say so.
 *
 * The context block is what turns "it did not work" into something
 * fixable: which tab, which language, what size screen, which build. No
 * identifiers, nothing about where they are, nothing they did not just
 * choose to send.
 */
import { supabase } from './supabaseClient.js';

export function feedbackContext(extra = {}) {
  if (typeof window === 'undefined') return extra;
  try {
    return {
      path: window.location.pathname + window.location.search.slice(0, 200),
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      lang: navigator.language,
      ua: navigator.userAgent.slice(0, 200),
      ...extra,
    };
  } catch {
    return extra;
  }
}

/** Resolves on success, throws with `code` set on refusal. */
export async function sendFeedback({ message, kind = 'other', email = null, context = null }) {
  if (!supabase) {
    const err = new Error('auth_not_configured');
    err.code = 'auth_not_configured';
    throw err;
  }
  const { data, error } = await supabase.rpc('submit_feedback', {
    p_message: message,
    p_kind: kind,
    p_email: email,
    p_context: context ?? feedbackContext(),
  });
  if (error) throw error;
  if (data && data.error) {
    const err = new Error(data.error);
    err.code = data.error;
    throw err;
  }
  return data;
}
