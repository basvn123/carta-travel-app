# waitlist

Waitlist and newsletter sign-up with double opt-in (T1110, K3). Migration 066 is the table.

Deploy (owner): `supabase secrets set RESEND_API_KEY=... WAITLIST_FROM="Carta <hello@carta-europetravel.com>" WAITLIST_SECRET=<long random>`, then `supabase functions deploy waitlist --no-verify-jwt`. Paste 066 first. Without the three secrets the form answers "unavailable" and nothing is stored.

The list is read for use only through `select * from waitlist_audience()` (service role): confirmed and not unsubscribed rows.
