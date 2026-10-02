# Support inbox and canned answers

Owner: Bas, the only person who reads and answers. Written by T216, 2026-10-02.
Companions: docs/REFUND_SOP.md (how a refund is done) and docs/INCIDENT_RUNBOOK.md (what to do when something
is down). This page is the front door to both: where a message arrives, how fast it is answered, and what to say.

## The address

The address is support@carta-europetravel.com. It is a mailbox the owner reads, not a person's name, so it
survives a change of who answers. The Imprint, the Terms, the Privacy Policy and the account panel must all
show this one address and no other. Today they show the owner's personal Gmail address, set as the CONTACT
constant in continent-app/src/components/Imprint.jsx, TermsOfService.jsx, PrivacyPolicy.jsx and
auth/AccountPanel.jsx. Switching them is one line each, and waits until the mailbox exists (register row
T216-a).

Set up the mailbox so that it can be monitored without effort: an alias that forwards to the owner's own inbox
works, as long as replies are sent from the support address (a "send as" setting), so customers never see the
personal address. Turn on a phone notification for a Gmail label or filter named Carta support, so a message is
seen the day it arrives. The Imprint needs a direct, quickly reachable email address; a forward satisfies that
as long as it is read.

## The response commitment

Every message gets a first human answer within two working days (Monday to Friday, Belgian time, not counting
Belgian public holidays). Refund requests get a decision within three working days. A data export or deletion
request is finished within seven days. The law allows a month for the last two (GDPR Article 12); seven is a
number one person can keep.

This is stricter than what the Terms say now. The Terms promise an answer within 30 days and, for a refund,
"usually within a few working days". Promising less than we do is safe and honest, so the Terms do not need to
change to ship this. If the owner wants the Terms to state the two-day figure, that is a text change, and it
becomes a promise the moment it is printed, so do it only after a month of keeping it (register row T216-b).

During a holiday, switch on an auto-reply that says how many days away and when the answer will come, and move
the dates in it. An unread inbox with no auto-reply breaks the promise silently; a stated absence does not.

Keep a count. Once a week, look at the oldest unanswered message. If it is older than two working days, the
commitment slipped that week; write down why. Do not count automated mail (Stripe, Supabase, Healthchecks).

## Canned answers

Every answer below is a starting point to paste and then adjust to the person. Fill the square brackets. Keep
them short, plain, in the language the customer wrote in. No answer says "unfortunately" twice, and none blames
the customer.

### 1. Refund request

Decide first, with the table in docs/REFUND_SOP.md. Never answer before looking the sale up.

Refund granted:

> Hi [name], thank you for writing. I found your [Trip Pass / Year Pass] bought on [date]. I have refunded
> [amount] to the card or account you paid with. It usually arrives within ten working days, depending on your
> bank. Your access ended today. If anything looks wrong on your statement after that, write back and I will
> look at it. Bas

Refund not granted (started pass, waiver accepted):

> Hi [name], thank you for writing. I understand you would like your money back for the [pass] bought on
> [date]. When you bought it you asked for access to start straight away and accepted that this ends the
> 14-day right to withdraw, which is also in the Refunds section of the Terms. Because you have used it, I
> cannot refund it. What I can do is [extend the pass by N days / help with whatever did not work]. If you
> think I have this wrong, tell me what happened and I will look again. Bas

Sale not found:

> Hi [name], I cannot find a purchase under this address. Could you write from the email address on your Carta
> account, or send the date and amount from your bank statement or the Stripe receipt? Then I can look it up.
> Bas

### 2. A price that turned out wrong

This is the message that tests the provenance chain. Carta does not price flights (owner decision of
2026-10-02, T272) and no screen shows a flight figure of its own since T273 removed the frozen estimates. A
flight in a total is one the traveller typed in. Every other figure carries what it is: a harvested quote shows its source and the day it was seen, a
cached quote shows its expiry, an estimate carries a tilde and the label est. Before answering, ask for the
place, the dates and a screenshot, open the same screen, and read the chip on the figure. Then answer with the
chip's own words, one of the three below.

The figure was an estimate:

> Hi [name], thank you for telling me. The [route / stay / day cost] you saw was an estimate, marked with a
> tilde and "est.". It is a model's best guess for that month, not a quote, and it can be off by a good margin.
> Carta never shows an estimate as a bookable price; the booking link goes to [provider], whose price on the
> day is the real one. I am sorry it did not match. I have noted the route so I can check how far off the
> estimate was. Bas

The figure was an observed quote that has aged:

> Hi [name], thank you for telling me. The price you saw came from [source], seen on [date], so it was [N] days
> old when you looked. Fares move; the age is shown next to the price for that reason. I checked the same
> [route/date] now and [source] shows [price]. I am sorry for the gap. Bas

The figure was wrong in our data (a bug, a mismatch, a wrong place):

> Hi [name], you are right, and thank you. [One sentence of what was wrong.] I have [fixed it / logged it to be
> fixed in the next update]. If you booked because of that figure and it cost you, write back with the
> details and we will work out what is fair. Bas

If a wrong price leads to a request for money, it is a goodwill case under docs/REFUND_SOP.md, not a case in the
table; the owner decides and prefers extra pass days to money. Log every wrong-data finding as a task, so the
fault is fixed once rather than answered each time.

### 3. Account deletion

> Hi [name], you can delete your account yourself, which is quickest: open Account, scroll to the bottom, press
> Delete account and confirm. It removes your profile, saved trips, plans and favourites at once, and cannot be
> undone. If you have an active pass, deleting the account ends it, and the unused share is only refunded in the
> cases listed under Refunds in the Terms. If you cannot sign in, tell me the email address of the account and
> I will do it for you within seven days. Bas

If they cannot sign in: confirm the request came from the address on the account, delete the user in the
Supabase dashboard, and answer once it is done. If they also asked for a refund, finish docs/REFUND_SOP.md first
and save the sale lookup query result before deleting, because deleting a user also deletes their pass_grants
rows (open item T217-d).

### 4. Data export request

> Hi [name], you can download your data yourself: open Account and press the export button. You get one file
> with your profile, trips, plans, favourites and notes, in a format you can read or move elsewhere. If that
> button fails or you cannot sign in, tell me the email address of the account and I will send the file to that
> address within seven days. Bas

If done by hand: run export_user_data(), the function the button calls, as that user and not as the owner (it
reads auth.uid()), or take the equivalent rows from the SQL editor. Send the file only to the address on the
account, never to a different address, even for a convincing reason; ask them to change the account address
first. The export function ships in migration 024, which is not yet applied to the live project, so until it is
the button will fail and the by-hand route is the only one.

### Unusual requests

Anyone asking to see, correct or object to something about their data, or writing as a lawyer, a regulator or a
platform: do not use a canned answer. Reply the same day that the message was received and that a full answer
follows within seven days, then take the time to read it twice.

## What the inbox is not

It is not the incident channel. A site that is down is handled with docs/INCIDENT_RUNBOOK.md, and readers who
report it are thanked, not asked for more detail. It is not the feedback inbox in the admin panel either: that
holds messages sent from inside the app, and the admin FeedbackInbox already offers a reply link from there.
Both end up with the same owner, so a repeated message in both is answered once.
