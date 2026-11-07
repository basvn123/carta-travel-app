# Back-translation check of the T1170 drafted strings (T1196, ROADMAP D23 and I8)

PROVISIONAL: the judge counts only once calibrated on the owner's labels (T1144-b, T1188-a), and the native review (T1170-a) is the real check.

3187 drafted strings. Holds: 3176 of 3187 (99.7%, 95% 99.4% to 99.8%).

| Language | Strings | Back-translated | Flagged | Failed checks | Judged | Holds | Holds, traveller-facing | Control supported | chrF++ median |
|---|---|---|---|---|---|---|---|---|---|
| nl | 583 | 583 | 376 | 0 | 385 | 578 of 583 (99.1%) | 173 of 175 (98.9%) | 9 of 9 | 93.21 |
| de | 651 | 651 | 408 | 0 | 416 | 650 of 651 (99.9%) | 242 of 243 (99.6%) | 8 of 8 | 84.66 |
| fr | 651 | 651 | 400 | 0 | 417 | 650 of 651 (99.9%) | 242 of 243 (99.6%) | 17 of 17 | 83.39 |
| es | 651 | 651 | 408 | 0 | 418 | 649 of 651 (99.7%) | 243 of 243 (100.0%) | 10 of 10 | 84.44 |
| it | 651 | 651 | 403 | 0 | 420 | 649 of 651 (99.7%) | 242 of 243 (99.6%) | 17 of 17 | 82.5 |

## Worst cases per language (traveller-facing first)

- nl `notfor.mtnExposure` (contradicted, chrF++ 40.35): EN "Not for you if you are uneasy with exposure. There is a long drop beside the path." / nl "Niets voor jou als je je ongemakkelijk voelt bij hoogte en diepte. Naast het pad is een lange val." / back "Nothing for you if you feel uncomfortable with height and depth. Next to the path is a long fall.". een lange val means a long fall (an event), not a drop in the ground (lead review, T1196).
- nl `trip.practicalParkRide` (unsupported, chrF++ 26.77): EN "Park and ride {dist} out" / nl "P+R {dist} verderop" / back "P+R {dist} further on". verderop (further along) drops out of the centre (lead review, T1196).
- nl `admin.reviewLateToday` (contradicted, chrF++ 69.73): EN "was due {date}" / nl "was verschuldigd op {date}" / back "was due on {date}". Verschuldigd means owed (as a debt), which changes the meaning of due for review into owed.
- nl `admin.reviewLateOne` (contradicted, chrF++ 84.28): EN "was due {date}, 1 day ago" / nl "was verschuldigd op {date}, 1 dag geleden" / back "was due on {date}, 1 day ago". Verschuldigd means owed (as a debt), which changes the meaning of due for review into owed.
- nl `admin.reviewLate` (contradicted, chrF++ 86.63): EN "was due {date}, {n} days ago" / nl "was verschuldigd op {date}, {n} dagen geleden" / back "was due on {date}, {n} days ago". Verschuldigd means owed (as a debt), which changes the meaning of due for review into owed.
- de `crash.card` (contradicted, chrF++ 46.14): EN "This card could not load." / de "Diese Karte konnte nicht geladen werden." / back "This map could not be loaded.". Karte reads as map in a travel app; the English means a UI card (lead review, T1196).
- fr `trip.timedLabel` (unsupported, chrF++ 9.95): EN "Worth timing" / fr "À chronométrer" / back "To be timed". The translation turns the judgement that the visit is worth timing into an instruction to time it with a stopwatch, dropping the original meaning.
- es `admin.colTarget` (unsupported, chrF++ 8.16): EN "Target" / es "Destino" / back "Destination". Destino reads as a travel destination in this app (lead review, T1196).
- es `admin.fGroundUsed` (unsupported, chrF++ 37.7): EN "Grounded searches used" / es "Búsquedas con datos en directo usadas" / back "Searches with live data used". The original says grounded searches; the translation adds that they use live data, which the source does not state.
- it `trip.practicalAirport` (contradicted, chrF++ 68.15): EN "{airport}, {min} min to the middle of {city}" / it "{airport}, {min} min dal centro di {city}" / back "{airport}, {min} min from the centre of {city}". Direction reversed: from the centre for to the middle (lead review, T1196).
- it `admin.colTarget` (contradicted, chrF++ 6.49): EN "Target" / it "Destinatario" / back "Recipient". Destinatario is a recipient, not the target of an audit action (lead review, T1196).
