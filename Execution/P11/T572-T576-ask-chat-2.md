# T572-T576: Ask Carta follow-ups, filter safety, one chat everywhere, chats in the account, live beds

Batch of five tasks, one batch branch `p11-ask-chat-2` (off `p11-ask-chat`) in the root repo and in `continent-app/`. Date: 2026-10-22.

The owner's answers to the T570-T571 report:
- fix the follow-up context, real stays, and the Explore-only button;
- T570-a: keep chats in the account;
- T571-c, as the owner read it: offer the current filters as keep or ignore, because a question rarely depends on them;
- T571-d: not now;
- T571-g: wait.

impeccable ran as before. Its detector returned nothing on the touched files, and carta-design held the decisions.

**Commits** (app repo):

| Commit | Task | Files |
|---|---|---|
| 12411d2 | T572 | `followup.js`, `outside.js` |
| 2a4c98a | T574 | store, door, host, door CSS, PlanAsk, App, AskSearch deleted |
| 8c665bc | T575 | cloud module, merge, export |
| 9155138 | T576 | trip card, Vite proxy |
| 472c529 | T572-T576 | the shared chat wiring |

Five files carry several tasks' hunks: `AskChat.jsx`, `AskTurn.jsx`, `ExploreTab.jsx`, `76-ask-chat.css`, plus the six i18n files and the test file. These went into one batch commit, because splitting hunks needs an interactive add. A single task can therefore be undone by reverting its own commit and editing the shared files by hand, as described under each task's rollback. The intermediate commits do not build on their own; the batch builds as a whole.

---

## T572: a follow-up carries the place

### What changed

`lib/ask/followup.js` binds a question that names no place to the place the last answer was about. Binding happens when the question either:
- points back ("there", "daar", "dort", "là", "allí", "lì"), or
- asks nothing of its own: no vibe, area, country, budget or other facet, and words the parser could not place.

A bound question becomes an about question (or keeps `when` and `plan`, which take a place) for that place.

How it shows and is kept:
- The question shows "About Porto" under it, so the binding is visible.
- Each turn keeps its `subject`, the answer's first place, in the chat, so a reopened chat still binds the next question.
- A question that points back is never read as a place outside Europe.

The end check found a bug: "Where to stay there?" was read as a trip to a place called "Stay". `outside.js` now ignores verbs after "to" in the six languages.

### Measurements

| Question after "Plan 7 days in Porto in May" | Before | After |
|---|---|---|
| "Where to stay there?" | a find over all of Europe | "About Porto": "Porto, Portugal." with Porto's trip card (flight, beds, what to do) |

### What broke

| What | Cause | Fix |
|---|---|---|
| "Where to stay there?" answered "Carta covers Europe, and Stay isn't in it yet." | `outsidePlace` took the unknown word after "to" as a destination | Verbs after "to" are skipped; a question that points back skips the outside check |

### Open

- T572-a: a month-only follow-up ("And in June?") is a new question, not bound to the last place. Binding it needs a rule for when a month alone means "the same place, another month".

### Rollback

Revert 12411d2, then remove `bindFollowUp` and `onSubject` from `AskTurn.jsx` and `AskChat.jsx` (472c529).

---

## T573: Explore's filters, offered rather than assumed

### What changed

Before this task the chat answered from all of Carta whatever Explore showed. Its "Show all N places" then replaced Explore's filters with the answer's.

Now, while Explore has filters on, the chat shows them above the field: "Explore filters on: Island", with a kit Segmented control offering Ignore (the default) and Keep. The choice applies per question:
- **Keep:** the answer reads only the places those filters leave, and says so ("Within your Explore filters: Island"). Its "Show all" adds to the filters instead of replacing them.
- **Ignore:** the question is asked of all of Carta, as before.

End check with Island on and Keep: "Cheapest places in November" gave 191 places, all islands (Terceira, Samos, Ikaria, Samothrace).

### Rollback

Remove `askFilters` (ExploreTab), `.ac-scope` and `filteredRows` (AskChat), and `turn.within` (AskTurn) from 472c529.

---

## T574: one chat for the whole app

### What changed

The chat is one instance, hosted by Explore (mounted from app start, and it holds the catalogue the answers read). It opens from doors through `askChatStore.js`:
- the header on every place on desktop (Explore, Plan, My trips);
- the Filters row on Explore on a phone;
- the Plan start page, where the old field door was (row T568-b).

The door's styles load with the door (`76-ask-door.css`). Before, they were in the chat's lazy sheet, so a door looked unstyled until the chat had opened once.

Behaviour:
- Focus goes back to whichever door opened the chat.
- "Show all" asked from another place switches to Explore (`onShowExplore`, App).
- `AskSearch.jsx` is deleted, because nothing calls it any more.

End check: the Plan tab's header door opened the one panel (one `.ac` in the page), holding the same 9 chats.

### Open

- T574-a: only Explore makes room for the docked panel. On Plan and My trips it lies over the right edge, including the planner's total bar.
- T574-b: `AskSearchFull.jsx`'s old panel is dead code. The chat uses its answer parts (`AskAnswer`, `WrittenAnswer`, `Receipt`, `AskTable`), and it holds the on-device switch (T557) for the coming local model. Move the parts into `browse/ask/` and retire the panel.
- T574-c: on a phone, the doors are Explore and Plan's start page only. My trips and the place pages have none.

### Rollback

Revert 2a4c98a; in 472c529, put `AskChatButton` back in ExploreTab.

---

## T575: chats in the account

### What changed

**Migration** `supabase/migrations/054_ask_chats.sql` (root repo):
- one row per chat per user (`chat_id`, `title`, `turns` jsonb, `updated_at`, `deleted_at` as a tombstone);
- RLS so a user reads and writes only their own rows, and anon reads nothing;
- at most 200 chats per account, and at most 256 KB of turns per chat;
- the account's chats are deleted with the account;
- a self-check, and the DOWN steps in its header.

**App:**
- `auth/askChatCloud.js` (fetch, upsert, tombstone).
- `mergeChats` in `sessions.js`: the newer side wins; a chat deleted in the account goes from the device unless it changed there after; the first sign-in sends the device's chats up.
- AskChat, signed in: merges on open; sends a chat up 1.5 s after its last change, and at once when the panel closes; turns a delete into a tombstone.
- A missing table (054 not pasted) turns the cloud off quietly; chats stay on the device as before.
- The data export (Account, GDPR Article 20) adds `askChats`, read under the same RLS, so `export_user_data()` is untouched.

### Commands run

```
initdb + pg_ctl (PostgreSQL 18, a throwaway cluster in the scratchpad on port 55434; Docker was not running)
psql -f t575_test.sql
```

The test pasted 054 twice (the self-check passed both times) and checked:
- user A writes and reads its own chat;
- user B sees none of A's chats, cannot insert as A, and cannot update or delete A's chat;
- anon is refused;
- a bad chat id and an object for turns are refused;
- chat number 201 is refused;
- deleting the account removes its chats.

The DOWN steps then removed the table and the function. The cluster was stopped.

### Measurements

Not measured.

### Open

- T575-a (owner, order 1): paste 054 in the Supabase SQL editor (never `db push`), look for "ask chats self-check passed", then run `node scripts/verify_live_policies.mjs`. Until then chats stay on the device.
- T575-b (owner): the privacy policy should say that, signed in, Ask Carta's questions and answers are kept in the account and appear in the export. This is legal copy, so it is the owner's.

### Rollback

Revert 8c665bc and the sync block in AskChat (472c529). Run 054's DOWN steps if the paste was made. Chats already in the account would be lost with the table; export them first if that matters.

---

## T576: beds at tonight's prices

### What changed

The trip card asks for live prices for the trip's own nights: the flight's dates, else the traveller's. It uses `/api/stays` (T540, Xotelo) through `loadLiveStay`, and prices the bed with `bedPrice()`, the same live reprice the place's own card uses.

A live bed shows without the estimate mark, with one status line: a green dot and "Adjusted to live prices for your nights". Xotelo prices hotel and room tiers only. Entire place, private room and dorm keep the modelled price with its "est.", as before.

The Pages preview has no `/api/stays` (404), so the dev server sends it to production (`carta-app.pages.dev`), which answers. It is read-only and cached for 12 hours at the edge; `STAYS_PROXY` chooses another deploy.

### Measurements

| Porto, 21 to 28 Nov, 2 people | Before | After |
|---|---|---|
| Hotel 3-star tier | "Beds from ~€56 est." (the cost index's estimate) | "Beds from €48 a person a night", "Adjusted to live prices for your nights" |
| Entire place (the owner's Lifestyle) | ~€56 est. | ~€56 est. (no live price exists for this tier) |

### Open

- T576-a: the owner's own Lifestyle (Entire place) never gets a live bed, because Xotelo is thin there (`liveStays.js`). A live source for whole places is a product decision.

### Rollback

Revert 9155138, and remove `stayTier` from `askTrip` in ExploreTab (472c529).

---

## Batch checks

```
npx eslint src/browse/ask/ src/lib/ask/ src/auth/askChatCloud.js src/browse/ExploreTab.jsx src/planner/PlanAsk.jsx
npm test                       # 638 pass, 0 fail (636 before; tests/askChat.test.mjs has 8)
node scripts/ci/design-lint.mjs  # no finding in touched files
impeccable detect --json ...   # []
fast NOPUBLIC build + css-routes --check   # 2319, none overridable
```

Sizes:
- eager JS 786,169 B (786,812 before), eager CSS 725,871 B (731,751);
- the chat chunk is 89,636 B: it now holds the answer parts AskSearchFull's chunk used to carry, so the two lazy chunks are one.

The browser end check covered desktop at 1366 px and phone at 390 px with touch:
- the follow-up "Where to stay there?";
- Keep and Ignore with Island on;
- the Plan tab's header door;
- the phone doors before the chat's sheet loads (175 and 175 px, no horizontal scroll);
- the live bed on a hotel tier.

Partway through, the dev server served a stale module graph (`PlanAsk.jsx` "has no export PlanAsk"). The old Vite from the session's start had outlived its stopped npm wrapper and held port 5173. Both stale Vite processes were stopped, and one was started on 5173 with `--strictPort`.
