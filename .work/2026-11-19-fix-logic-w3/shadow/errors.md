# Errors (G4): party and stay-ladder golden cases that fail

Old path: every failure is a target case, the gap E2 and E3 close. New path: nothing fails.

## Flags off (old): 19 of 38 cases fail

- party/E2-cars-4a-1b (target): got {"explore":1,"places":1,"planner":2,"day":2}, want {"explore":2,"places":2,"planner":2,"day":2}. B-9 probe P8: 4 adults and a baby are one car on Explore and Places and two in the planner; owner default 2, the baby takes a seat, so two everywhere
- party/E2-cars-3a-1c-1b (target): got {"explore":1,"places":1,"planner":2,"day":2}, want {"explore":2,"places":2,"planner":2,"day":2}. B-9: five car seats are two cars on every screen
- party/E2-footprint-4a-1b (target): got {"kg":32.4}, want {"kg":64.8}. B-10: a party that needs two cars emits two cars' grams shared over its seats: 800 km x 162 g x 2 cars / 4 seats = 64.8 kg
- party/E2-footprint-6a (target): got {"kg":25.9}, want {"kg":43.2}. B-10: six adults are two cars, 800 x 162 x 2 / 6 = 43.2 kg; the cap of 5 seats shared one car's grams over five and gave 25.9
- party/E2-daybudget-babies (target): got {"over":false,"gap":47}, want {"over":false,"gap":4}. H-8 and V-9: a day budget is for adults plus children; (700 + 500) / 2 heads / 7 nights = 85.7, within 90 by 4; dividing by the two babies too gave 42.9
- party/E2-kind-teens (target): got {"kind":"friends"}, want {"kind":"family"}. G-8: two adults and two teens (13 and 15) are a family; owner default 2, teens priced as adults and kind family
- party/E2-limits-7-babies (target): got {"planner":7,"style":7,"party":4}, want {"planner":4,"style":4,"party":4}. G-9: one cap for every screen (config party.limits max_babies 4); the planner and the style took 7
- stay-ladder/E3-dorm-venice (target): got {"tier":"home","fallback":true,"unit":"place"}, want {"tier":"hotel3","fallback":true,"unit":"room"}. A-2 and G-6: a solo dorm request in Venice (no hostel) fell to the entire place at 194 a night; owner default 3: dorm, private, 2-star, 3-star, so the 3-star room at 84
- stay-ladder/E3-dorm-santorini (target): got {"tier":"home","fallback":true,"unit":"place"}, want {"tier":"hotel2","fallback":true,"unit":"room"}. A-2: Santorini has no hostel; the ladder reaches the 2-star room at 62 before the entire place at 115
- stay-ladder/E3-row-venice (target): got {"tier":"home","fallback":true}, want {"tier":"hotel3","fallback":true}. G-6 ladder half: the Explore row (costRow) takes the same ladder, so the card and the planner agree
- stay-ladder/E3-home-gothenburg (target): got {"tier":"dorm","fallback":true,"units":3}, want {"tier":"hotel3","fallback":true,"units":1}. A-2: an entire place in Gothenburg (no Airbnb) priced the family in a dorm, three beds; the ladder for an entire place goes to the 3-star, one room for 2 + 2
- stay-ladder/E3-room-gothenburg (target): got {"tier":"dorm","fallback":true}, want {"tier":"private","fallback":true}. A-2: an Airbnb room where there is no Airbnb falls to the hostel's private room, not a dorm
- stay-ladder/E3-hotel5-charleroi (target): got {"tier":"home","fallback":true,"unit":"place"}, want {"tier":"hotel4","fallback":true,"unit":"room"}. A-2: a 5-star request where there are none fell to the entire place; owner default 3, a dear request goes 5-star, 4-star, 3-star
- stay-ladder/E3-rooms-2a-2c (target): got {"unit":"room","units":2,"total":576}, want {"unit":"room","units":1,"total":288}. A-4: children share the parents' room; owner default 4, up to 2 children in a room; one room, 3 nights at 96
- stay-ladder/E3-rooms-2a-1c (target): got {"unit":"room","units":2}, want {"unit":"room","units":1}. A-4: 2 adults + 1 child book one room, not two
- stay-ladder/E3-rooms-2a-3c (target): got {"unit":"room","units":3}, want {"unit":"room","units":2}. A-4: a room holds 2 children, so three children need a second room
- stay-ladder/E3-dorm-children (target): got {"unit":"bed","units":3,"total":225}, want {"unit":"bed","units":4,"total":300}. A-15: children in a dorm get one bed each (owner default 4); two adults and two children are four beds, 4 x 25 x 3 nights; two children sharing one bed was the old half bed
- stay-ladder/E3-cleaning-4a (target): got {"unit":"place","units":2,"cleaning":52}, want {"unit":"place","units":2,"cleaning":104}. A-3: four adults book two places for two and each is cleaned; cleaning was charged once (52)
- stay-ladder/E3-cleaning-4a-4c (target): got {"unit":"place","units":4,"cleaning":52}, want {"unit":"place","units":4,"cleaning":208}. A-3: eight sleepers are four places and four cleanings (4 x 52)

## Flags on (new): 0 of 38 cases fail


