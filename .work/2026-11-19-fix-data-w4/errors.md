# errors.md: remaining failures after the rules (data wave 4, rebuilt after judge 1)

Distinct rows listed: 56.
Every row is one the rules still file wrongly or arguably wrongly, grouped by cause. Rows are (shard, name, kind after, desc, heritage). Heuristic selection from the live must-sees after `classify_poi`; fine rows (Dam, Belfast City Hall, colleges) are not listed.

## wrong wiki join: the name is a building but desc describes a settlement (data cause: `wiki` points at the town article; the classifier cannot tell): 9 rows
- gem:alba-iulia | Batthyaneum Library | Town | City and county capital in Alba County, Romania | heritage
- gem:alonissos | Alonnisos Museum | Museum | Municipality in Greece | 
- gem:broughton-in-furness | Duddon Bridge | Bridge | Hamlet in Cumbria, England | heritage
- gem:jagodina | Jagodina Zoo | Museum | City in Pomoravlje District, Serbia | 
- gem:johvi | Kukruse manor | Village | Village in Estonia | heritage
- gem:makrinitsa | Theofilos Museum of Anakasia | Museum | City in Thessaly, Greece | heritage
- gem:new-milton | Peterson's Tower | Tower | Village and parish in Hampshire, England | heritage
- gem:slieve-league | Glencolumbkille Church | Church | Village and parish in County Donegal, Ireland | heritage

## settlement kept as a must-see: desc says village, town or municipality and the name has no building word (data cause: a place article filed as a sight): 188 rows
- AMS | Dam | Square | Town square in Amsterdam | heritage
- BZG | Mill Island in Bydgoszcz | Nature reserve | City park in Bydgoszcz, Poland | heritage
- EFL | Kranioi | Village | Human settlement in Greece | heritage
- FUE | Betancuria | Village | Municipality in Canary Islands, Spain | heritage
- GDN | Gdańsk Main Town Hall | Palace | Town hall in Gdańsk, Poland | heritage
- gem:abrantes | Abrantes | Village | Municipality in Oeste e Vale do Tejo, Portugal | heritage
- gem:agira | Agira Canadian War Cemetery | Village | comune italiano | 
- gem:alpujarras-pampaneira | Capileira | Village | Municipality in Andalusia, Spain | heritage
- gem:asbyrgi | Skinnastaður | Village | Village in Northeast Constituency, Iceland | 
- gem:atherstone | Atherstone | Town | Market town and civil parish in Warwickshire, England | heritage
- gem:atina | Atina | Village | comune italiano | 
- gem:bad-ems | Bad Ems | Town | Town in Rhineland-Palatinate, Germany | heritage

## event-like row kept as a must-see by heritage or a site word (rule: the site-word guard): 24 rows
- gem:berwick-upon-tweed | Battle of Halidon Hill | Attraction | 1333 battle of the 2nd War of Scottish Independence | heritage
- gem:bradford | Battle of Adwalton Moor | Attraction | Battle that took place in 1643 during the First English Civi | heritage
- gem:chester | Battle of Rowton Heath | Attraction | 1645 battle of the First English Civil War | heritage
- gem:devizes | Battle of Roundway Down | Attraction | 1643 battle of the First English Civil War | heritage
- gem:enfield | Battle of Barnet | Attraction | 1471 engagement in the Wars of the Roses | heritage
- gem:evesham | Battle of Evesham | Attraction | 1265 battle of the Second Barons' War in England | heritage
- gem:folkestone | Kent Battle of Britain Museum | Museum | Aviation museum in Hawkinge, Kent, England | 
- gem:lanaye | Battle of Fort Eben-Emael | Castle | Battle (WW2) | 
- gem:langport | Battle of Langport | Attraction | 1645 battle of the First English Civil War | heritage
- gem:market-drayton | Battle of Blore Heath | Attraction | 1459 battle in the War of the Roses | heritage
- gem:norrkoping | Getå railroad disaster | Square | 1918 train derailment in Getå, Sweden | heritage
- gem:northallerton | Battle of the Standard | Attraction | 1138 battle between England and Scotland | heritage

## a ground, school, university, hospital or station kept as a must-see (rule: no kind for it, kept as Attraction; a real sight if heritage): 110 rows
- AGP | University of Málaga | Attraction | Public university in Málaga, Spain | 
- ARN | Stockholms Olympiastadion | Attraction | Stadium and central venue for 1912 Olympic Games | heritage
- ARN | Royal Institute of Technology | Attraction | University in Stockholm, Sweden | heritage
- ARN | Stockholm Bromma Airport | Attraction | Airport in Sweden | heritage
- ATH | Panathenaic Stadium | Attraction | Stadium in Athens, Greece | heritage
- BCN | Camp Nou | Attraction | Football stadium in Barcelona, Catalonia, Spain | heritage
- BCN | Estadi Olímpic Lluís Companys | Attraction | Stadium in Barcelona, Catalonia, Spain | heritage
- BCN | Torre Glòries | Tower | Skyscraper in Catalonia, Spain | heritage
- BFS | Kingspan Stadium | Attraction | Stadium in Belfast | 
- BGY | Giuseppe Meazza Stadium | Attraction | Stadium in Milan, Italy | heritage
- BLQ | Stadio Renato Dall'Ara | Attraction | Football stadium | heritage
- CIA | Stadio Olimpico | Attraction | Stadium in Rome, Italy | 

## filed Attraction because no word said better (rule: fallback, kind is coarse, not wrong): 802 rows
- AHO | Anghelu Ruju Necropolis | Attraction |  | heritage
- AJA | immeuble | Attraction |  | heritage
- AMS | Olympic Stadium | Attraction |  | heritage
- ATH | Old Parthenon | Attraction |  | heritage
- BCM | Hospodar's court in Bacău | Attraction |  | heritage
- BGY | Ottagono | Attraction |  | heritage
- BRE | Roland | Attraction |  | heritage
- BRE | Turmbläser | Attraction |  | heritage
- BRE | St.Jacobus | Attraction |  | heritage
- BRN | Old City | Attraction |  | heritage
- BRN | Samson fountain | Attraction |  | heritage
- BRN | Moses Fountain | Attraction |  | heritage

## dossier highlight matching the ban regex but kept (rule: heritage or memorial word, or a regex false positive): 0 rows
