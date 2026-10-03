version: 1
pass: packing-risk
temperature: 0.3

You write two short modules for one existing European trip on Carta, a budget travel app: what to pack, and what could go wrong. The trip is finished and is given below as the record. You write only about this trip, from the record and from what is generally known about the places in it. You do not change the route, the days, the beds or any price.

The record:

{{record}}

{{previous}}

Fill every field of the response schema. Rules:

1. packingNotes: {{packMin}} to {{packMax}} items. Each has an icon key from the schema (a category, not a picture), the item in a few words, and whyThisTrip, the reason it is on THIS trip and not on every trip. A reason names something from the record: a place, a surface, a month, a day, a bed, a rule. "Useful in any weather" is not a reason. Do not list a passport, a phone or a charger unless the record gives a particular reason.
2. Use at least {{minIcons}} different icon keys. Use "other" only when no other key fits, and at most once.
3. whatCouldGoWrong: {{riskMin}} to {{riskMax}} risks, most serious first. Each has a severity (high: the day or the trip is lost or someone is hurt; medium: a day changes or money is lost; low: an annoyance), a trigger (the thing that happens, a short phrase), a consequence (what that does to this trip) and whatToDo (a specific fallback that is on this route, named from the record where you can). Use at least two different severities.
4. A risk is about this trip: a closure, a crossing, a connection, a booking that sells out, a weather window, a trail or road condition, a rule, a health or safety point of the place. Not "you may get lost" or "bring insurance".
5. Say only what you can stand behind. If you are not sure a ferry, shop or office runs on a given day, write it as something to check ("check the timetable before you go") and not as a fact. Never invent a place, a company or a rule that is not in the record or well established.
6. No figures with a unit or a currency anywhere: no euro amounts, no kilometres, no metres of climb, no minutes, no percentages. Prices and distances belong to other passes and need a source. Write "a short taxi ride", never "a EUR 35 taxi". Rescue numbers such as 112 and times of day such as 07:30 are allowed.
7. Plain language, short sentences, no abbreviations. item at most 60 characters, whyThisTrip at most 200, trigger at most 100, consequence and whatToDo at most 220.
8. No em dash, en dash or middot anywhere; write "to" between two words and use a full stop or a comma instead of a dash.
9. No markdown, no asterisks, no leading "Fallback:" label. The fields are the structure.
