# Labelling guide: Carta travel taxonomy

For the owner (or a second labeller) filling `continent-app/scripts/eval/taxonomy/gold.csv`, the 400 items the taxonomy eval scores (T1149, ROADMAP F1). The taxonomy is `pipeline/taxonomy/carta_taxonomy.yaml`, version 1.0.0; the node list at the end of this page is generated from it, and the YAML wins where they differ. Background: [taxonomy.md](taxonomy.md).

## The job

For each row, write every taxonomy tag that is true of the item and that a traveller would care about, as ids separated by `;`, in the `labels` column. Not the five best: every one that holds. The eval needs the full set to measure recall; a missing true tag counts against a tagger that found it.

Columns:

| Column | What |
|---|---|
| `item_id`, `layer`, `kind`, `country`, `name` | The item. `layer` is place, trail, beach, lake or mountain; `kind` is its class (village, city...), trail grade or water kind. Do not change these. |
| `context` | The place blurb, or a trail's length, climb and OpenStreetMap link. A start, not the evidence. |
| `labels` | Your tags: ids such as `set.lake;act.lake-swimming;vibe.quiet`. |
| `unsure` | Ids you considered and could not decide, same format. They are not scored; they show which definitions need work. |
| `note` | Anything the taxonomy lacks ("needs a node for thermal river pools"), or why the item is odd. |
| `by`, `at` | Your initials and the date (YYYY-MM-DD). |

The template does not show the tags Carta holds today, on purpose: the eval compares the tagger with those old tags, and seeing them would pull your labels toward them.

## How to decide

1. Look the item up: its Wikipedia or Wikivoyage page and photos for a place, beach, lake or mountain; the OpenStreetMap relation for a trail (what it passes, where it starts). Five minutes is enough; about ten items an hour once you are used to it.
2. Label the item itself, not its region. Florence is `act.art`; a village 30 km from Florence is not, unless it has its own art. A town is `set.lakeside-town` only if it is on the shore.
3. Label what a visitor can do or see without a special trip. A city with one small museum is not `act.museums`; one with a museum people plan a day around is.
4. Use the most specific node that holds, and only that one: a cove is `set.cove`, not also `set.beach` and `set.coast`. The eval gives partial credit one step up or down the tree, so the specific node is never a loss.
5. Read the definition, not only the label, and check the "not to be confused with" column before you choose. The pairs that are mixed up most: `set.old-town` and `set.medieval` (a historic centre against a period), `act.museums` and `act.art`, `set.seaside-town` and `set.beach`, `vibe.quiet` and `vibe.remote`, `vibe.iconic` and `set.landmarks`, `act.easy-walk` and `act.day-hike`, `set.gorge` and `set.valley`.
6. Skip the nodes marked "data rule, do not label" in the list below (trail grade and shape, Blue Flag, bathing water rating, wheelchair access, lifts, cost). A rule sets them from the data; the eval leaves them out.
7. Vibe and traveller tags need evidence too: `vibe.romantic` when guides or reviews describe it so, not because it is pretty. Pretty is `vibe.photogenic` or `vibe.views`.
8. A trail is labelled for the walk: what it passes (`set.waterfall`, `set.castle`), what it is (`act.day-hike`, `act.long-distance-walk`, `act.coastal-walk`), who it suits (`trav.families`, `trav.experienced-outdoors`). The town it starts from is not the trail.
9. If nothing fits, leave `labels` empty and write why in `note`. An empty row is not scored.

Two examples:

- `gem:hallstatt` (place, village, AT): `set.village;set.lakeside-town;set.mountains;vibe.iconic;vibe.fairytale;vibe.views`. Not `set.lake` (`set.lakeside-town` is narrower), not `set.unesco` (a data rule).
- `185975` Durham Coastal Path (trail, hard, GB): `act.coastal-walk;set.cliffs;set.beach;act.day-hike;set.industrial` (the old colliery coast). Not `set.coast`: `set.cliffs` and `set.beach` sit under it.

## Agreement

One labeller gives a gold set; two give a gold set you can trust. If a second person labels, both label the same 60 rows first (the first 60 of the file, every layer is in them), blind to each other. Then run `python -I pipeline/taxonomy/taxonomy.py check` for validity, and compare: agreement per item is the overlap of the two sets (MASI distance, Passonneau 2006), summed over items into Krippendorff's alpha; 0.67 is the usual floor and 0.8 the aim. Nodes the two disagree on most get their definition or "not to be confused with" sharpened before the other 340 rows. SkillSpan went from 0.6 to about 0.75 this way. The agreement script is open work (T1149-e).

## When you are done

```
cd continent-app && node scripts/eval/run.mjs taxonomy --write --dashboard
```

The eval then scores `gold.csv` instead of the seed set. Commit `gold.csv`, `data/reports/evals/` and `docs/reference/evals.md`. `python -I pipeline/taxonomy/build_label_template.py --check` confirms the item list is still the seeded draw (it never compares your labels).

## The nodes

On: P place, T trail, B beach, L lake, M mountain. Indentation shows the level.

### Activity

| Id | Label | Means | Not to be confused with | On |
|---|---|---|---|---|
| `act.sightseeing` | Sightseeing and culture | Looking at buildings, collections, art and performances made by people. | set.heritage | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.museums` | Museums | One or more museums worth planning time for. | act.art | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.art` | Art | Known for art: galleries, painters who lived there, an art scene. | act.museums | P |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`act.street-art` | Street art | Murals and street art worth walking for. |  | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.architecture` | Architecture | Buildings a visitor comes for as architecture, old or new. | set.modern-architecture | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.performing-arts` | Theatre, opera and concerts | Performances: theatre, opera, classical music, ballet. | act.live-music | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.festivals` | Festivals | A festival, carnival or event people travel for. | act.performing-arts | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.literary` | Literary and film places | Places tied to writers, books or films. |  | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.pilgrimage` | Pilgrim routes | A pilgrimage destination or a pilgrim route. | set.religious | PT |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.viewpoints` | Viewpoint | A place to stand and look at a view, built or natural. | vibe.views | PTLM |
| `act.hiking` | Hiking | Walking on paths through landscape, from strolls to treks. | act.trail-running | PTLM |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.easy-walk` | Easy walks | Short, gentle walks anyone can do. | act.day-hike | PTBL |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.day-hike` | Day hikes | A walk of a few hours to a day on marked paths. | act.easy-walk | PT |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.summit-hike` | Summit hikes | A walk whose goal is a summit. | act.mountaineering | TM |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.coastal-walk` | Coastal walks | A walk along the sea, on cliffs or beaches. | set.cliffs | PTB |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.long-distance-walk` | Long distance trails | A trail walked over several days, stage by stage. | act.hut-to-hut | PT |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`act.hut-to-hut` | Hut to hut trekking | Several days in the mountains, sleeping in huts. | set.mountain-hut | PTM |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.trail-running` | Trail running | Running on mountain and forest paths. | act.day-hike | PT |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.via-ferrata` | Via ferrata | A protected climbing route with fixed cables and ladders. | act.climbing | TM |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.mountaineering` | Mountaineering | Alpine climbing on rock, snow or glacier with gear. | act.summit-hike | TM |
| `act.cycling` | Cycling | Riding a bike for the ride itself. |  | PT |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.bike-touring` | Bike touring | Riding paved or easy routes, often between towns. | act.gravel | PT |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`act.long-distance-cycling` | Long distance cycle routes | A long route such as a EuroVelo ridden over days. |  | PT |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.gravel` | Gravel riding | Riding unpaved roads and tracks on a gravel bike. | act.mtb | PT |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.mtb` | Mountain biking | Riding rough trails on a mountain bike. | act.gravel | PT |
| `act.water` | Water sports | Swimming, paddling, sailing and other time on water. |  | PBL |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.sea-swimming` | Sea swimming | Swimming in the sea. | act.lake-swimming | PB |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.lake-swimming` | Lake swimming | Swimming in a lake. | act.sea-swimming | PL |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.wild-swimming` | River and wild swimming | Swimming in rivers, pools and unguarded water. | act.lake-swimming | PL |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.surfing` | Surfing | Riding waves on a board. | act.kitesurfing | PB |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`act.kitesurfing` | Kitesurfing and windsurfing | Wind sports on a board: kite or sail. | act.sailing | PBL |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.diving` | Diving | Scuba diving. | act.snorkelling | PBL |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`act.snorkelling` | Snorkelling | Swimming with a mask over clear water. | act.diving | PBL |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.sailing` | Sailing | Sailing yachts or dinghies. | act.boat-trips | PL |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.paddling` | Kayaking and paddling | Kayak, canoe or paddleboard. | act.rafting | PBL |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.rafting` | Rafting and canyoning | Descending wild rivers or canyons. | act.paddling | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.boat-trips` | Boat trips | Excursions and ferries on sea, lake or river. | act.sailing | PBL |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.fishing` | Fishing | Angling or a fishing tradition visitors see. |  | PL |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.water-park` | Water park | A park of pools and slides. | act.theme-park | P |
| `act.winter` | Ski & snow | Activities on snow and ice. | prac.good-in-winter | PM |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.skiing` | Skiing | Lifts and pistes for skiing or snowboarding. | act.ski-touring | PM |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.ski-touring` | Ski touring and cross-country | Skiing off the lifts: touring, cross-country, Nordic. | act.skiing | PM |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.snowshoeing` | Snowshoeing and winter walks | Walking on snow. | act.ski-touring | PT |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.northern-lights` | Northern lights | A good place to see the aurora. | act.stargazing | P |
| `act.adventure` | Adventure sports | Sports with some thrill or technique. | vibe.adventurous | PTM |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.climbing` | Climbing | Rock climbing and bouldering. | act.via-ferrata | PM |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.caving` | Caves and caving | Visiting or exploring caves. | set.sea-cave | PTM |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.paragliding` | Paragliding | Flying from a hill under a canopy. |  | PM |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.horse-riding` | Horse riding | Riding horses. |  | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.golf` | Golf | Golf courses people travel for. |  | P |
| `act.food` | Food and wine | Eating and drinking as a reason to come. |  | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.local-cuisine` | Local cuisine | Dishes and cooking of the region. | act.fine-dining | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.wine` | Wine and vineyards | Wine tasting, cellars and vineyards. | set.vineyards | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.beer` | Beer and breweries | Breweries, beer halls and a beer culture. | act.bars | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.markets` | Market | Food or general markets worth a visit. | act.shopping | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.fine-dining` | Fine dining | Starred or notable restaurants. | act.local-cuisine | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.cafes` | Cafes and coffee | A cafe or coffee culture. | act.bars | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.foraging` | Foraging | Gathering wild food. |  | PT |
| `act.wellness` | Wellness & spa | Rest and care of the body. | vibe.slow | PL |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.thermal-baths` | Spa and thermal baths | Hot springs, thermal baths and spas. | set.hot-spring | PL |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.sauna` | Sauna | Sauna culture. | act.thermal-baths | PL |
| `act.nightlife` | Nightlife | Going out after dark. | vibe.lively | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.bars` | Bars and pubs | Bars, pubs and wine bars. | act.beer | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.clubbing` | Clubs and parties | Dancing, clubs and party scenes. | act.live-music | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.live-music` | Live music | Bands, folk music and music venues. | act.performing-arts | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.casino` | Casino | A casino people visit. |  | P |
| `act.shopping` | Shopping | Shopping as a reason to come. | act.markets | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.crafts` | Local crafts | Crafts made there: pottery, lace, glass. |  | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.fashion` | Fashion and design | Fashion and design shopping. |  | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.tax-free` | Tax-free shopping | A duty-free or low tax shopping area. | prac.affordable | P |
| `act.family-fun` | Family attractions | Attractions built for children. | trav.families | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.theme-park` | Theme park | Rides and a themed park. | act.water-park | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.zoo` | Zoo | A zoo or animal park. | act.wildlife | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.aquarium` | Aquarium | An aquarium. |  | P |
| `act.nature-watching` | Wildlife and sky | Watching animals, birds and the night sky. |  | PTBLM |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.wildlife` | Wildlife | Seeing wild animals in the wild. | act.zoo | PTBLM |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`act.birdwatching` | Birdwatching | Watching birds. |  | PTL |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.stargazing` | Stargazing and dark skies | Dark skies and observatories. | act.northern-lights | PM |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.photography` | Photography | A place photographers come for. | vibe.photogenic | PTBLM |
| `act.touring` | Touring | Travel itself as the activity. |  | PT |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.road-trip` | Road trip | Driving from place to place for the drive. | act.scenic-drive | P |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`act.scenic-drive` | Scenic drives and passes | A road worth driving: a pass, a coast road. | prac.road-to-top | PM |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.rail-journey` | Rail journeys | Travelling by train as part of the trip. | prac.rail-access | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.island-hopping` | Island hopping | Moving between islands by boat. | set.island | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`act.lift-rides` | Cable car | A cable car, funicular or rack railway ridden for the ride. | prac.lift-access | PM |

### Setting

| Id | Label | Means | Not to be confused with | On |
|---|---|---|---|---|
| `set.coast` | Coast | Next to the sea. | set.lake | PTB |
| &nbsp;&nbsp;&nbsp;&nbsp;`set.beach` | Beach | A beach on the sea. | set.lake | PB |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`set.sandy-beach` | Sandy beach | A beach of sand. (data rule, do not label) | set.dunes | B |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`set.pebble-beach` | Pebble or rock beach | A beach of pebbles, gravel, shingle or rock. (data rule, do not label) | set.sandy-beach | B |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`set.cove` | Pocket cove | A small beach in a bay between rocks. | set.bay | B |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`set.long-strand` | Long strand | A long open beach. | set.cove | B |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`set.black-sand` | Black sand | Dark volcanic sand. |  | B |
| &nbsp;&nbsp;&nbsp;&nbsp;`set.bay` | Bay | A sheltered bay. | set.cove | PB |
| &nbsp;&nbsp;&nbsp;&nbsp;`set.cliffs` | Cliffs | High rock walls, mostly over the sea. | set.gorge | PTBLM |
| &nbsp;&nbsp;&nbsp;&nbsp;`set.dunes` | Dunes | Sand dunes. | set.sandy-beach | PTB |
| &nbsp;&nbsp;&nbsp;&nbsp;`set.lagoon` | Lagoon | Shallow water cut off from the sea. | set.lake | PBL |
| &nbsp;&nbsp;&nbsp;&nbsp;`set.sea-cave` | Sea cave | Caves and rock arches at the sea. | act.caving | PB |
| &nbsp;&nbsp;&nbsp;&nbsp;`set.clear-water` | Turquoise water | Water you can see the bottom through. | prac.water-excellent | PBL |
| &nbsp;&nbsp;&nbsp;&nbsp;`set.seaside-town` | Beach town | A town on the sea with beaches to swim from. | set.beach | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`set.fjord` | Fjord | A long, deep sea inlet between steep mountains. | set.lake | PTB |
| &nbsp;&nbsp;&nbsp;&nbsp;`set.harbour` | Harbour and fishing port | A working or old harbour. | set.seaside-town | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`set.peninsula` | Peninsula | A place on a peninsula. | set.island | P |
| `set.island` | Island | On an island. | set.peninsula | PBLM |
| &nbsp;&nbsp;&nbsp;&nbsp;`set.archipelago` | Archipelago | A group of islands. |  | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`set.tidal-island` | Tidal island | An island reached on foot at low tide. |  | P |
| `set.mountains` | Mountains | In or under mountains. | set.hills | PTLM |
| &nbsp;&nbsp;&nbsp;&nbsp;`set.alpine` | High mountains | High mountains above the tree line. | set.hills | PTLM |
| &nbsp;&nbsp;&nbsp;&nbsp;`set.peak` | Summit | A named summit. | act.summit-hike | TM |
| &nbsp;&nbsp;&nbsp;&nbsp;`set.glacier` | Glacier | A glacier or ice field. | set.mountain-lake | PTLM |
| &nbsp;&nbsp;&nbsp;&nbsp;`set.volcano` | Volcano | A volcano, active or not, or volcanic land. | set.crater-lake | PTM |
| &nbsp;&nbsp;&nbsp;&nbsp;`set.ridge` | Ridge and massif | A ridge, massif or plateau. | set.peak | TM |
| &nbsp;&nbsp;&nbsp;&nbsp;`set.hills` | Hill | Rolling hills, not high mountains. | set.alpine | PTM |
| &nbsp;&nbsp;&nbsp;&nbsp;`set.mountain-hut` | Mountain hut | A staffed or open hut. | act.hut-to-hut | TM |
| &nbsp;&nbsp;&nbsp;&nbsp;`set.ski-resort` | Ski resort | A town built around skiing. | act.skiing | P |
| `set.freshwater` | Lakes and rivers | Next to fresh water. | set.coast | PTL |
| &nbsp;&nbsp;&nbsp;&nbsp;`set.lake` | Lake | On or by a lake. | set.lagoon | PTL |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`set.mountain-lake` | Mountain tarn | A lake in the mountains, often small and cold. | set.crater-lake | TL |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`set.crater-lake` | Crater lake | A lake in a volcanic crater. | set.mountain-lake | TL |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`set.reservoir` | Reservoir | A lake made by a dam. |  | TL |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`set.lakeside-town` | Lakeside | A town on a lake shore. | set.seaside-town | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`set.river` | River | On a river worth being by. | set.canals | PTL |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`set.canals` | Canals | A town of canals. | set.river | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`set.waterfall` | Waterfall | A waterfall. | set.gorge | PTLM |
| &nbsp;&nbsp;&nbsp;&nbsp;`set.gorge` | Gorge | A narrow valley with steep walls. | set.valley | PTM |
| &nbsp;&nbsp;&nbsp;&nbsp;`set.hot-spring` | Hot spring | Water that comes up warm. | act.thermal-baths | PTL |
| &nbsp;&nbsp;&nbsp;&nbsp;`set.spring` | Spring | A spring or source. | set.hot-spring | T |
| `set.green` | Nature | Nature and the farmed land around towns. | set.wilderness | PTBLM |
| &nbsp;&nbsp;&nbsp;&nbsp;`set.forest` | Forest | Woods and forest. |  | PTL |
| &nbsp;&nbsp;&nbsp;&nbsp;`set.countryside` | Countryside | Farmland, fields and small roads. | set.wilderness | PT |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`set.vineyards` | Vineyards | Vineyards in the landscape. | act.wine | PT |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`set.flower-fields` | Flower fields | Lavender, tulips or other fields in bloom. |  | PT |
| &nbsp;&nbsp;&nbsp;&nbsp;`set.valley` | Valley | A valley. | set.gorge | PT |
| &nbsp;&nbsp;&nbsp;&nbsp;`set.wilderness` | Wilderness | Land with almost nothing built on it. | vibe.remote | PTM |
| &nbsp;&nbsp;&nbsp;&nbsp;`set.moor` | Moor and bog | Moorland, heath and bog. |  | PT |
| &nbsp;&nbsp;&nbsp;&nbsp;`set.arctic` | Arctic and tundra | North of the Arctic circle or on tundra. | act.northern-lights | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`set.rock-formations` | Rock formation | Odd rocks, karst and stone landscapes. | set.cliffs | PTM |
| &nbsp;&nbsp;&nbsp;&nbsp;`set.cave` | Cave | A cave. | act.caving | PTM |
| &nbsp;&nbsp;&nbsp;&nbsp;`set.parks` | Park | Parks and gardens. | set.protected-area | PT |
| &nbsp;&nbsp;&nbsp;&nbsp;`set.protected-area` | Protected nature | A protected area: park, reserve or Natura 2000. | set.parks | PTBLM |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`set.national-park` | National park | Inside or next to a national park. |  | PTBLM |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`set.nature-reserve` | Nature reserve | A nature reserve. |  | PTBLM |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`set.natura2000` | Natura 2000 | A Natura 2000 or Emerald site. (data rule, do not label) |  | BL |
| `set.urban` | Towns and cities | The built place itself. |  | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`set.big-city` | City | A city with city life. | set.capital | P |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`set.capital` | Capital city | A national or regional capital. |  | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`set.small-town` | Small towns | A small town. | set.village | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`set.village` | Village | A village. | set.small-town | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`set.old-town` | Old town | A historic centre with old streets and squares. | set.medieval | P |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`set.walled-town` | Walled town | A town inside its walls. | set.fortress | P |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`set.squares` | Squares | Squares and piazzas to sit in. |  | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`set.university-town` | University town | A town shaped by a university. |  | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`set.spa-town` | Spa town | A town built around its springs and baths. | act.thermal-baths | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`set.market-town` | Market town | A town with a market tradition. | act.markets | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`set.modern-architecture` | Modern architecture | Modern buildings worth seeing. | act.architecture | P |
| `set.heritage` | History | History you can see. | act.sightseeing | PTLM |
| &nbsp;&nbsp;&nbsp;&nbsp;`set.unesco` | UNESCO | On or in a UNESCO World Heritage site. (data rule, do not label) | vibe.iconic | PTBLM |
| &nbsp;&nbsp;&nbsp;&nbsp;`set.landmarks` | Landmarks | A famous building or monument. | vibe.iconic | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`set.castle` | Castle | A castle. | set.palace | PTLM |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`set.fortress` | Fortress | A fortress, citadel or city walls. | set.walled-town | PT |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`set.palace` | Palace | A palace or grand residence. | set.castle | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`set.religious` | Religious buildings | Churches, monasteries and other houses of worship. | act.pilgrimage | PT |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`set.cathedral` | Cathedral | A cathedral or basilica. | set.church | P |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`set.church` | Church | A church or chapel worth seeing. | set.cathedral | PT |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`set.monastery` | Monastery | A monastery, abbey or convent. | set.church | PT |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`set.mosque` | Mosque | A mosque. |  | P |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`set.synagogue` | Synagogue | A synagogue or Jewish quarter. |  | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`set.ancient` | Ancient sites | Remains from before the Middle Ages. | set.ruins | PT |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`set.roman` | Roman remains | Roman towns, theatres, aqueducts and roads. | set.ancient-greek | PT |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`set.ancient-greek` | Ancient Greek | Ancient Greek temples, theatres and sites. | set.roman | PT |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`set.prehistoric` | Prehistoric | Megaliths, cave art and older remains. |  | PT |
| &nbsp;&nbsp;&nbsp;&nbsp;`set.ruins` | Ruins | Ruins of any age. | set.ancient | PT |
| &nbsp;&nbsp;&nbsp;&nbsp;`set.periods` | Historic styles | The period or style a place is known for. |  | P |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`set.medieval` | Medieval | Medieval streets and buildings. | set.old-town | P |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`set.gothic` | Gothic | Gothic architecture. | set.medieval | P |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`set.renaissance` | Renaissance | Renaissance architecture and art. | set.baroque | P |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`set.baroque` | Baroque | Baroque architecture. | set.renaissance | P |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`set.byzantine` | Byzantine | Byzantine churches and mosaics. | set.ottoman | P |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`set.ottoman` | Ottoman | Ottoman towns and buildings. | set.byzantine | P |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`set.venetian` | Venetian | Venetian rule and buildings around the Adriatic and Aegean. |  | P |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`set.art-nouveau` | Art nouveau | Art nouveau and Jugendstil buildings. | set.modern-architecture | P |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`set.georgian` | Georgian and Victorian | Georgian and Victorian British towns. |  | P |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`set.viking` | Viking and Norse | Viking and Norse history. |  | P |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`set.hanseatic` | Hanseatic | Hanseatic merchant towns. |  | P |
| &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`set.imperial` | Imperial | Grand imperial capitals and buildings. | vibe.elegant | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`set.bridges` | Bridges | A bridge worth seeing. |  | PT |
| &nbsp;&nbsp;&nbsp;&nbsp;`set.towers` | Towers | Towers and belfries. |  | PT |
| &nbsp;&nbsp;&nbsp;&nbsp;`set.lighthouse` | Lighthouse | A lighthouse. |  | PTB |
| &nbsp;&nbsp;&nbsp;&nbsp;`set.memorial` | Memorials and war history | Memorials and places of war history. |  | PT |
| &nbsp;&nbsp;&nbsp;&nbsp;`set.windmills` | Windmills | Windmills. |  | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`set.vernacular` | Traditional houses | Typical local houses: trulli, whitewashed, red cottages. | vibe.authentic | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`set.industrial` | Industrial heritage | Mines, factories and old industry. |  | PT |

### Vibe

| Id | Label | Means | Not to be confused with | On |
|---|---|---|---|---|
| `vibe.atmosphere` | Atmosphere | The mood of the place. |  | PTBLM |
| &nbsp;&nbsp;&nbsp;&nbsp;`vibe.quiet` | Quiet and calm | Calm, with few people. | vibe.remote | PTBLM |
| &nbsp;&nbsp;&nbsp;&nbsp;`vibe.lively` | Lively | Busy streets, people, things going on. | act.nightlife | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`vibe.romantic` | Romantic | Made for couples. | trav.couples | PBL |
| &nbsp;&nbsp;&nbsp;&nbsp;`vibe.fairytale` | Fairytale | Looks like a storybook. | vibe.photogenic | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`vibe.authentic` | Authentic and traditional | Local life and traditions, not built for visitors. | vibe.hidden-gem | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`vibe.elegant` | Elegant | Grand, refined, stylish. | trav.luxury | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`vibe.bohemian` | Creative and bohemian | Artists, students and an alternative scene. | act.art | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`vibe.quirky` | Curious and quirky | Odd, surprising things to see. |  | P |
| `vibe.scenery` | Scenery | How the landscape looks. |  | PTBLM |
| &nbsp;&nbsp;&nbsp;&nbsp;`vibe.views` | Scenic views | Wide views over land or water. | act.viewpoints | PTLM |
| &nbsp;&nbsp;&nbsp;&nbsp;`vibe.dramatic` | Dramatic landscape | Steep, wild, striking landscape. | vibe.views | PTBLM |
| &nbsp;&nbsp;&nbsp;&nbsp;`vibe.photogenic` | Photogenic | Looks good in photos. | vibe.fairytale | PTBLM |
| &nbsp;&nbsp;&nbsp;&nbsp;`vibe.colourful` | Colourful | Colourful houses or landscapes. |  | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`vibe.remote` | Remote | Far from everything. | vibe.quiet | PTBLM |
| `vibe.pace` | Pace | How fast the days go. |  | PT |
| &nbsp;&nbsp;&nbsp;&nbsp;`vibe.slow` | Slow travel | Made for staying put and slowing down. | act.wellness | PT |
| &nbsp;&nbsp;&nbsp;&nbsp;`vibe.adventurous` | Outdoor adventure | Outdoor thrills and effort. | act.adventure | PTM |
| `vibe.fame` | Fame | How well known it is. |  | PTBLM |
| &nbsp;&nbsp;&nbsp;&nbsp;`vibe.iconic` | Iconic | World famous, on everyone's list. | set.landmarks | PTBLM |
| &nbsp;&nbsp;&nbsp;&nbsp;`vibe.hidden-gem` | Hidden gems | Good and not well known. | vibe.remote | PTBLM |

### Traveller

| Id | Label | Means | Not to be confused with | On |
|---|---|---|---|---|
| `trav.who` | Who it suits | The group it suits. |  | PTBLM |
| &nbsp;&nbsp;&nbsp;&nbsp;`trav.families` | Good for families | Easy and fun with children. | act.family-fun | PTBLM |
| &nbsp;&nbsp;&nbsp;&nbsp;`trav.couples` | Couples | Made for two. | vibe.romantic | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`trav.solo` | Solo travellers | Easy and social alone. |  | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`trav.friends` | Groups of friends | Fun in a group. | act.clubbing | P |
| `trav.style` | Travel style | How someone travels. |  | PTBLM |
| &nbsp;&nbsp;&nbsp;&nbsp;`trav.backpacker` | Budget backpacking | Hostels, buses and a small budget. | prac.affordable | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`trav.luxury` | Luxury | Top hotels and a big budget. | vibe.elegant | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`trav.first-timer` | First visit to Europe | A classic first stop. | vibe.iconic | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`trav.beginner-outdoors` | Beginner | Fine for someone new to hiking or the water. | prac.grade-easy | TLM |
| &nbsp;&nbsp;&nbsp;&nbsp;`trav.experienced-outdoors` | Experienced outdoors | Needs experience, fitness or gear. | prac.grade-alpine | TM |
| &nbsp;&nbsp;&nbsp;&nbsp;`trav.naturist` | Naturist | A beach where naturism is the custom. (data rule, do not label) |  | B |

### Practical

| Id | Label | Means | Not to be confused with | On |
|---|---|---|---|---|
| `prac.access` | Getting there and around | How to reach it. |  | PTBLM |
| &nbsp;&nbsp;&nbsp;&nbsp;`prac.car-free` | Easy without a car | Reached and enjoyed by public transport or on foot. | prac.car-needed | PTBLM |
| &nbsp;&nbsp;&nbsp;&nbsp;`prac.car-needed` | Car needed | Hard without a car. | prac.car-free | PTBLM |
| &nbsp;&nbsp;&nbsp;&nbsp;`prac.rail-access` | On the railway | A station in or near it. (data rule, do not label) | act.rail-journey | PT |
| &nbsp;&nbsp;&nbsp;&nbsp;`prac.boat-only` | Boat access only | Reached only by boat. | act.boat-trips | PB |
| &nbsp;&nbsp;&nbsp;&nbsp;`prac.walk-in` | Walk in | Reached only on foot. |  | BLM |
| &nbsp;&nbsp;&nbsp;&nbsp;`prac.lift-access` | Lift up | A lift or cable car goes up. (data rule, do not label) | act.lift-rides | PM |
| &nbsp;&nbsp;&nbsp;&nbsp;`prac.road-to-top` | Road to the top | A road goes to the top. (data rule, do not label) | act.scenic-drive | M |
| &nbsp;&nbsp;&nbsp;&nbsp;`prac.steps` | Steps down | Steps to get there. (data rule, do not label) |  | B |
| `prac.accessibility` | Accessibility | Who can get around. |  | PTBLM |
| &nbsp;&nbsp;&nbsp;&nbsp;`prac.wheelchair` | Wheelchair | Usable by wheelchair. (data rule, do not label) | prac.pushchair | PTBL |
| &nbsp;&nbsp;&nbsp;&nbsp;`prac.pushchair` | Pushchair | Usable with a pushchair. (data rule, do not label) | prac.wheelchair | PTBL |
| &nbsp;&nbsp;&nbsp;&nbsp;`prac.dogs` | Dogs | Dogs welcome. (data rule, do not label) |  | TB |
| `prac.season` | Season | When to go. |  | PTBLM |
| &nbsp;&nbsp;&nbsp;&nbsp;`prac.summer-only` | Summer only | Closed or empty outside summer. |  | PM |
| &nbsp;&nbsp;&nbsp;&nbsp;`prac.good-in-winter` | Winter | Worth it in winter. | act.winter | PT |
| &nbsp;&nbsp;&nbsp;&nbsp;`prac.warm-winter` | Warm in winter | Mild sunny winters. (data rule, do not label) |  | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`prac.autumn-colours` | Autumn colours | Autumn leaves worth coming for. |  | PT |
| `prac.cost` | Cost | What it costs. Set from the price engine, not from text. (data rule, do not label) |  | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`prac.affordable` | Affordable | Cheaper than its peers. (data rule, do not label) | trav.backpacker | P |
| &nbsp;&nbsp;&nbsp;&nbsp;`prac.expensive` | Expensive | Dearer than its peers. (data rule, do not label) | trav.luxury | P |
| `prac.difficulty` | How hard | How hard the walk is. Set from the trail grade, not from text. (data rule, do not label) |  | TM |
| &nbsp;&nbsp;&nbsp;&nbsp;`prac.grade-easy` | Easy | Trail grade easy. (data rule, do not label) | trav.beginner-outdoors | TM |
| &nbsp;&nbsp;&nbsp;&nbsp;`prac.grade-moderate` | Moderate | Trail grade moderate. (data rule, do not label) |  | TM |
| &nbsp;&nbsp;&nbsp;&nbsp;`prac.grade-hard` | Hard | Trail grade hard. (data rule, do not label) |  | TM |
| &nbsp;&nbsp;&nbsp;&nbsp;`prac.grade-very-hard` | Very hard | Trail grade very hard. (data rule, do not label) |  | TM |
| &nbsp;&nbsp;&nbsp;&nbsp;`prac.grade-alpine` | Alpine | Trail grade alpine (SAC T4 or more). (data rule, do not label) | act.mountaineering | TM |
| `prac.route-shape` | Route shape | The shape of the walk. (data rule, do not label) |  | T |
| &nbsp;&nbsp;&nbsp;&nbsp;`prac.loop` | Loop | Ends where it starts. (data rule, do not label) | prac.out-and-back | T |
| &nbsp;&nbsp;&nbsp;&nbsp;`prac.point-to-point` | Point to point | Ends somewhere else. (data rule, do not label) | prac.loop | T |
| &nbsp;&nbsp;&nbsp;&nbsp;`prac.out-and-back` | Out and back | Goes out and returns the same way. (data rule, do not label) | prac.loop | T |
| `prac.facilities` | Facilities | What is on site. |  | PBLM |
| &nbsp;&nbsp;&nbsp;&nbsp;`prac.lifeguard` | Lifeguard | A lifeguard in season. (data rule, do not label) |  | BL |
| &nbsp;&nbsp;&nbsp;&nbsp;`prac.blue-flag` | Blue Flag | Holds a Blue Flag. (data rule, do not label) | prac.water-excellent | B |
| &nbsp;&nbsp;&nbsp;&nbsp;`prac.water-excellent` | Excellent water | EU bathing water rated excellent. (data rule, do not label) | set.clear-water | BL |
| &nbsp;&nbsp;&nbsp;&nbsp;`prac.lido` | Lido | A lido or official bathing place. (data rule, do not label) | prac.water-excellent | L |
| &nbsp;&nbsp;&nbsp;&nbsp;`prac.summit-food` | Food at the top | Food or a hut on the summit. (data rule, do not label) | set.mountain-hut | M |
| &nbsp;&nbsp;&nbsp;&nbsp;`prac.shallow` | Shallow | Shallow water near shore. (data rule, do not label) | trav.families | B |
| &nbsp;&nbsp;&nbsp;&nbsp;`prac.undeveloped` | Nothing built on it | Nothing built on the shore. (data rule, do not label) | set.wilderness | BL |
