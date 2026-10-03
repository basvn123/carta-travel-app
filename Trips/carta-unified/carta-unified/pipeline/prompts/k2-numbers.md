version: 1
pass: numbers
temperature: 0.0
grounding: true

You fill the figures of a seven-day European trip for Carta, a budget travel app. This is pass three of three: the numbers. The route, the days, the bases and the words are decided and are given below. You add costs, distances, climbs, times, prices, the surface split and the booking windows, and nothing else. You have web search. Use it.

The trip so far:

{{trip}}

Answer with one JSON object and nothing around it, matching this schema exactly:

{{schema}}

Rules:

1. You may not invent a figure. Every figure you give must come from a page you actually read in this session. For each figure give one evidence row: path is the dotted path of the figure (for example budget.breakdown.food, itinerary[2].dayStats.distanceKm, accommodationStrategy[0].priceEur, typeSpecific.surfaceMix), url is the page it came from, basis is one sentence on how the page gives it. A figure without an evidence row whose url you really read is treated as invented and withheld.
2. When a figure cannot be sourced, give null for it and add one line to verifyFlags saying which figure and why. Giving null is right; guessing is wrong. The budget breakdown rows (accommodation, food, transport, activities, per person for the week, in euros) are the one place null is not allowed: source them from price pages, booking sites or official tourism figures, and say in the row's note what the range assumes, in words without euro amounts.
3. Distances in kilometres and climbs in metres come from route pages, trail portals, official cycle route sites or mapping services. timeMin is a realistic moving-time range in minutes. spendEur is what that day's tickets, tastings, hire or tolls cost per person, or null.
4. gateways[].transferMin is the usual airport-to-base transfer in minutes from the operator's timetable or official site.
5. accommodationStrategy[].priceEur is the price range in euros with priceUnit saying what the unit is (room-night, person-night, bed-night, person-week), from the property's own site or a booking site; priceNote says what the price covers in words only.
6. typeSpecific.surfaceMix lists surfaces with whole-number percentages adding to 100, or null when the trip type has no surface. typeSpecific.distanceKm, elevationM and verticalM are the week's totals, or null. typeSpecific.bookingTimeline and logistics.bookingWindows say in words how far ahead what must be booked, with the operator's stated lead time where a page gives one.
7. eurRate is units of the local currency to one euro, as a low and high over the past year, or null when the currency is the euro. currencyNote is words only.
8. sources.verified lists in one paragraph what you checked and where; sources.confidenceNotes says what you could not confirm.
9. Notes beside a typed number (totalNote, breakdown notes, priceNote, dayStats.note, currencyNote) carry no euro figures and no ranges of their own: the figures are in the typed fields next to them.
10. Prices in another currency are converted to euros at today's rate and the conversion is said in the evidence basis.
11. No em dash, en dash or middot anywhere. Dates as YYYY-MM-DD.
