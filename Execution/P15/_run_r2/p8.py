# Usage: p7.py <checklist.html> <report.md>...  Collects "Owner steps (for the checklist)" bullets into phase 8.
import sys, re, json, os
html_path = sys.argv[1]; store = os.path.join(os.path.dirname(__file__), 'owner_steps.json')
items = json.load(open(store, encoding='utf-8')) if os.path.exists(store) else []
seen = {i['id'] for i in items}
for rp in sys.argv[2:]:
    txt = open(rp, encoding='utf-8').read()
    m = re.search(r'^## Owner steps \(for the checklist\)\s*\n(.*?)(?=^## |\Z)', txt, re.S | re.M)
    if not m: continue
    task = re.search(r'(T\d{4})', os.path.basename(rp)).group(1)
    for line in m.group(1).splitlines():
        mm = re.match(r'- \[([^\]]+)\]\s*(.*)', line.strip())
        if not mm: continue
        iid = mm.group(1).strip(); raw = [p.strip() for p in mm.group(2).split(' | ')]
        parts = raw if len(raw) <= 4 else raw[:2] + [' | '.join(raw[2:-1]), raw[-1]]
        if iid in seen: continue
        title, why = parts[0], (parts[1] if len(parts) > 1 else '')
        how = [s.strip() for s in parts[2].split(';') if s.strip()] if len(parts) > 2 else []
        where = parts[3] if len(parts) > 3 else rp
        it = {'id': iid, 'title': title, 'why': why[:1].upper() + why[1:] + ('' if why.endswith('.') else '.'), 'where': where}
        if how: it['how'] = [h[:1].upper() + h[1:] for h in how]
        items.append(it); seen.add(iid)
json.dump(items, open(store, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
phase = "    { key: 'round2', title: '8. From round 2', blurb: 'Steps the round 2 sessions (S51 and on, from 2026-11-06) could not do from the cloud. Each comes from that task report; most wait until the code is merged and deployed.', items: " + json.dumps(items, ensure_ascii=False) + " }"
h = open(html_path, encoding='utf-8').read()
block = "/*P8*/\n" + phase + "\n/*P8END*/"
if '/*P8*/' in h:
    h = re.sub(r'/\*P8\*/.*?/\*P8END\*/', lambda m: block, h, flags=re.S)
else:
    assert h.count('/*P7END*/') == 1
    h = h.replace('/*P7END*/', '/*P7END*/,' + chr(10) + block, 1)
open(html_path, 'w', encoding='utf-8', newline='').write(h); print(len(items), 'round 2 items')
