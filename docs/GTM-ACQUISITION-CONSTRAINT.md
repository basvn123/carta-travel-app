# Carta go-to-market: the acquisition constraint

**€6.85 contribution per purchase, ~2.5% assumed purchase rate, therefore about €0.17 of allowable spend per visitor and about €3.04 of allowable CAC per payer at a 3:1 ratio. Therefore: no paid search, no paid social, no influencer fees, no sponsorships, until contribution per user is several times higher.**

This is arithmetic, not a marketing opinion. It saves you from the default startup instinct of buying traffic. It also reframes the plan: coverage work in P7 is the marketing budget, spent in engineering hours rather than in ad spend.

Every figure in this document comes from CARTA_UNIT_ECONOMICS.md section 5 unless another source is named next to it. Where the source gives no number, this document gives none.

## How the constraint is derived

All of this is from CARTA_UNIT_ECONOMICS.md section 5, "Financial model".

The blended assumption is a 70% Trip Pass and 30% Year Pass mix. That gives €7.32 net revenue per purchase and €0.47 typical AI cost, so €6.85 contribution per purchase.

The base scenario assumes a 2.5% monthly purchase rate of MAU. At €6.85 contribution and a 2.5% purchase rate, each visitor is worth about €0.17.

The lifetime value block assumes one-off passes with no renewal and 25% of buyers purchasing again within 12 months. That gives a lifetime value of about €9.11 per payer and about €0.38 per registered user (pass plus affiliate). At a 3:1 ratio the allowable CAC is about €3.04 per payer, which is €0.08 per registered user.

## Why it binds

The source states it directly: "No paid channel delivers a European travel-intent visitor for €0.17." That sentence is the source's claim. This document does not carry its own price list for paid channels, because none exists in the source or in this repository, and an unsourced price would be invented. If someone proposes a paid channel, the test is simple: can it deliver a visitor for about €0.17 or less, with evidence from a quote or a measured test. If not, it is out.

The source's conclusion is that paid acquisition is off the table until contribution per user is several times higher. The source gives no number for "several times". Fixing that number is a product decision and is open as T204-a.

## What replaces paid traffic

The source says SEO and organic are the only viable channels. That makes the Destinations coverage work the single most important revenue activity in the plan. The source names the surface: 17,619 trails, 22,289 bathing waters and 3,000 to 5,000 mountains, each an indexable page with data nobody else publishes. The catalogue of 3,868 destinations is from Execution/P12/T201-positioning.md.

The honest coverage and reason code work matters commercially too. The source's example is a page that says "we know of 31 more walks in Albania and cannot map 19 of them", which ranks and converts better than a blank grid.

The tasks that build this surface already exist in Execution/_ORDER.md. T205 is the programmatic SEO plan, T221 is static prerendering, T222 is the sitemap, T239 is the organic acquisition surface, and T243 is the conversion funnel. The P7 coverage tasks are T106, T111 and T112.

## Affiliate as free-user monetisation

From CARTA_UNIT_ECONOMICS.md section 4, Lever 7. Free users cost €0.02. The conservative model is 10,000 MAU, about 15% clicking an affiliate link, about 2% converting, about 30 bookings at €3 to €5, so €90 to €150 a month, about €0.01 per MAU. It is linear in traffic: at 100k MAU it is €900 to €1,500 a month. The source says nobody is measuring it. Click and conversion tracking is task T234, so this document does not raise it again.

## Testing a channel proposal against the constraint

Any proposal for a channel (T207 launch channels, T208 press and partnerships, anything later) must state three things. First, the expected cost per visitor, with its source. Second, how that compares with €0.17. Third, if it is above €0.17, which of the source's levers (section 4) is expected to raise contribution per user first, and by how much. A proposal that cannot state the first number is not ready for a decision.

Free or earned channels cost engineering or writing time instead of cash. They are tested the same way: name the hours and say what coverage or content they produce.

## Levers that raise the ceiling

The source's own levers for contribution per user are in section 4 of CARTA_UNIT_ECONOMICS.md. Lever 1 is per-fact grounding, which the source expects to cut grounded units by 60 to 80%. It is designed in T041 and built in T147, with the live allowance in T148. Section 3.5 raises the VAT question, where net receipts per pass rise by about 23% if a small-enterprise exemption applies. The accountant answer is T015. Lever 5 is shifting the mix to the Year Pass. These move the arithmetic above. This document does not predict by how much they move the €0.17.

## References

CARTA_UNIT_ECONOMICS.md sections 3.5, 4 and 5 (additional docs/Carta/Plan/Finance). Execution/_ORDER.md for the task ids named above. Execution/P12/T201-positioning.md for the 3,868 destination count.
