"""The hero review queue: a person, a contact sheet, one click.

Same pattern as the trails review app (tools/trailslab/review): binds
127.0.0.1 only, every decision appends to a ledger with an actor, and
nothing here publishes; the caches change and the next export ships them.

    python pipeline/photos/review.py            # port 8012
    open http://127.0.0.1:8012/

The queue's priority order is the brief's: rows in top.json first (the
most seen cards in the product), then rows whose top two beauty scores
sit within 0.05 of each other (the model is undecided), then rows whose
hero carries no naming evidence, then everything else.

For one row the view shows the top six candidates by beauty, the current
hero marked. One click to promote a candidate (it becomes images[0] in
the rich cache), one to reject with a reason code. Both feed the
evaluation set: a promoted file is labelled good, a rejected file is
labelled bad with the reason, so every review session grows the labelled
set the thresholds are tuned against.

Reason codes: wrong-subject, board-or-sign, building, vehicle-or-street,
people, bad-season, bad-weather, too-dark, blurry, other.

ASCII clean, no em dashes, per project convention.
"""

import argparse
import getpass
import json
import os
import re
import sys
import time
from pathlib import Path

from fastapi import Body, FastAPI, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))

import selection  # noqa: E402

LEDGER = ROOT / "cache" / "photos" / "review_ledger.jsonl"
EVAL_MANIFEST = HERE / "evalset" / "manifest.json"
PUBLIC = ROOT / "continent-app" / "public"

LAYERS = {
    "beaches": ("beaches", "beaches", "key", "beach"),
    "lakes": ("lakes", "lakes", "key", "lake"),
    "mountains": ("mountains", "peaks", "wd", "mountain"),
}
REASONS = ("wrong-subject", "board-or-sign", "building",
           "vehicle-or-street", "people", "bad-season", "bad-weather",
           "too-dark", "blurry", "other")

REVIEWER = os.environ.get("CARTA_REVIEWER") or getpass.getuser()
ALLOWED_ORIGINS = {"http://127.0.0.1:8012", "http://localhost:8012"}

app = FastAPI()


@app.middleware("http")
async def origin_guard(request: Request, call_next):
    origin = request.headers.get("origin")
    if request.method != "GET" and origin \
            and origin not in ALLOWED_ORIGINS:
        return JSONResponse({"detail": "origin refused"}, status_code=403)
    return await call_next(request)


# ---------------------------------------------------------------------------
# Cache access
# ---------------------------------------------------------------------------

def cache_path(layer, cc):
    return ROOT / "cache" / LAYERS[layer][0] / f"rich_{cc}.json"


def load_country(layer, cc):
    path = cache_path(layer, cc)
    if not path.exists():
        raise HTTPException(404, f"no cache for {layer}/{cc}")
    return json.loads(path.read_text(encoding="utf-8"))


def save_country(layer, cc, data):
    path = cache_path(layer, cc)
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1),
                   encoding="utf-8")
    tmp.replace(path)


def find_row(data, layer, key):
    row_key = LAYERS[layer][2]
    for row in data.get(LAYERS[layer][1]) or []:
        if str(row.get(row_key)) == key:
            return row
    raise HTTPException(404, "row not found")


def ledger_append(entry):
    LEDGER.parent.mkdir(parents=True, exist_ok=True)
    entry = {"at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
             "actor": REVIEWER, **entry}
    with open(LEDGER, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(entry, ensure_ascii=False) + "\n")


def eval_label(category, name, img, label, why=""):
    """Every human decision grows the labelled set (evalset.py)."""
    rows = []
    if EVAL_MANIFEST.exists():
        rows = json.loads(EVAL_MANIFEST.read_text(encoding="utf-8"))
    url = img.get("url") or img.get("full") or ""
    for row in rows:
        if row.get("img") == url:
            row["label"], row["why"] = label, why
            break
    else:
        rows.append({"category": category, "row": "", "name": name,
                     "img": url, "label": label, "why": why})
    EVAL_MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    EVAL_MANIFEST.write_text(json.dumps(rows, ensure_ascii=False,
                                        indent=1), encoding="utf-8")


# ---------------------------------------------------------------------------
# Queue priority
# ---------------------------------------------------------------------------

def top_ids(layer):
    """wd suffixes of the layer's top.json rows: the cards most seen."""
    path = PUBLIC / layer / "top.json"
    if not path.exists():
        return set()
    data = json.loads(path.read_text(encoding="utf-8"))
    rows = next((v for v in data.values() if isinstance(v, list)), [])
    out = set()
    for row in rows:
        m = re.search(r"(Q\d+)$", str(row.get("id") or ""))
        if m:
            out.add(m.group(1))
        if row.get("wd"):
            out.add(str(row["wd"]))
    return out


def priority_of(row, layer, tops):
    images = row.get("images") or []
    if not images:
        return None
    row_wd = str(row.get("wd") or "")
    if row_wd and row_wd in tops:
        band, why = 0, "in top.json"
    elif selection.undecided(images):
        band, why = 1, "top two within 0.05"
    else:
        hero = images[0]
        tier = hero.get("evidence") or hero.get("why") or ""
        if tier in selection.NEVER_HERO or not tier:
            band, why = 2, f"hero evidence: {tier or 'unrecorded'}"
        else:
            band, why = 3, ""
    return band, why


@app.get("/api/queue")
def queue(layer: str = Query("beaches"), limit: int = Query(200)):
    if layer not in LAYERS:
        raise HTTPException(400, "unknown layer")
    tops = top_ids(layer)
    row_key = LAYERS[layer][2]
    out = []
    for path in sorted((ROOT / "cache" / LAYERS[layer][0])
                       .glob("rich_??.json")):
        cc = path.stem[-2:]
        data = json.loads(path.read_text(encoding="utf-8"))
        for row in data.get(LAYERS[layer][1]) or []:
            prio = priority_of(row, layer, tops)
            if prio is None:
                continue
            band, why = prio
            out.append({"layer": layer, "cc": cc,
                        "key": str(row.get(row_key)),
                        "name": row.get("name") or "",
                        "band": band, "why": why,
                        "n": len(row.get("images") or [])})
    out.sort(key=lambda r: (r["band"], r["cc"], r["name"]))
    return {"queue": out[:limit], "total": len(out),
            "reviewer": REVIEWER}


@app.get("/api/row")
def row_detail(layer: str, cc: str, key: str):
    data = load_country(layer, cc.upper())
    row = find_row(data, layer, key)
    images = []
    ranked = sorted(row.get("images") or [],
                    key=lambda i: -(i.get("beauty") or 0.0))
    for img in ranked[:6]:
        images.append({
            "file": img.get("file") or "",
            "url": img.get("url") or img.get("full") or "",
            "beauty": img.get("beauty"),
            "aesthetic": img.get("aesthetic"),
            "month": img.get("month"),
            "evidence": img.get("evidence") or img.get("why") or "",
            "vetoed": img.get("vetoed") or img.get("vetoed_human") or "",
            "author": img.get("author") or "",
            "license": img.get("license") or "",
            "is_hero": img is (row.get("images") or [None])[0],
        })
    return {"name": row.get("name"), "images": images,
            "reasons": REASONS}


@app.post("/api/decision")
def decision(payload: dict = Body(...)):
    layer = payload.get("layer")
    cc = str(payload.get("cc") or "").upper()
    key = str(payload.get("key") or "")
    file = payload.get("file") or ""
    action = payload.get("action")
    reason = payload.get("reason") or ""
    if layer not in LAYERS or action not in ("promote", "reject"):
        raise HTTPException(400, "bad decision")
    if action == "reject" and reason not in REASONS:
        raise HTTPException(400, "unknown reason code")
    category = LAYERS[layer][3]
    data = load_country(layer, cc)
    row = find_row(data, layer, key)
    images = row.get("images") or []
    target = next((i for i in images if i.get("file") == file), None)
    if target is None:
        raise HTTPException(404, "image not on this row")

    if action == "promote":
        row["images"] = [target] + [i for i in images if i is not target]
        eval_label(category, row.get("name") or "", target, "good")
    else:
        target["vetoed_human"] = reason
        rest = [i for i in images if i is not target]
        clean = [i for i in rest if not (i.get("vetoed")
                                         or i.get("vetoed_human"))]
        if len(clean) >= 2:
            row["images"] = rest          # dropped outright
        else:
            row["images"] = rest + [target]   # demoted, count survives
        eval_label(category, row.get("name") or "", target, "bad",
                   why=reason)
    save_country(layer, cc, data)
    ledger_append({"layer": layer, "cc": cc, "key": key, "file": file,
                   "action": action, "reason": reason})
    return {"ok": True}


# ---------------------------------------------------------------------------
# The page
# ---------------------------------------------------------------------------

PAGE = """<!doctype html>
<html><head><meta charset="utf-8"><title>Hero review</title>
<style>
:root{--ink:#0E1116;--ink-70:#4A525E;--ink-45:#78818F;--paper:#fff;
--panel:#F4F5F7;--line:#E3E6EB;--line-strong:#C7CCD5;--signal:#1E3FD6;
--signal-dark:#14309F;--signal-wash:#EDF1FE;--down:#B3261E;}
*{box-sizing:border-box;margin:0}
body{font:15px/1.55 "Instrument Sans","Segoe UI",system-ui,sans-serif;
 color:var(--ink);background:var(--paper);padding:24px 32px}
h1{font-size:24px;font-weight:600;letter-spacing:-.02em;margin-bottom:4px}
.meta{color:var(--ink-45);font-family:"IBM Plex Mono",Consolas,monospace;
 font-size:12.5px;margin-bottom:20px}
select{height:38px;border:1px solid var(--line-strong);border-radius:6px;
 padding:0 8px;font:inherit;margin-right:8px}
.queue{border-top:1px solid var(--line);margin-top:16px}
.qrow{display:flex;gap:16px;align-items:center;padding:9px 4px;
 border-bottom:1px solid var(--line);cursor:pointer}
.qrow:hover{background:var(--panel)}
.qrow.active{background:var(--signal-wash)}
.qrow .band{font-family:"IBM Plex Mono",Consolas,monospace;font-size:12.5px;
 color:var(--ink-45);width:170px}
.qrow .cc{font-family:"IBM Plex Mono",Consolas,monospace;width:32px}
.sheet{margin:20px 0;display:grid;
 grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px}
.cand{border:1px solid var(--line);border-radius:10px;overflow:hidden;
 background:var(--paper)}
.cand.hero{border:2px solid var(--signal)}
.cand img{width:100%;height:150px;object-fit:cover;display:block;
 background:var(--panel)}
.cand .facts{padding:10px 12px;font-family:"IBM Plex Mono",Consolas,
 monospace;font-size:12.5px;color:var(--ink-70)}
.cand .facts .veto{color:var(--down)}
.cand .acts{display:flex;gap:8px;padding:0 12px 12px}
button{height:34px;border-radius:6px;font:500 14px "Instrument Sans",
 system-ui,sans-serif;cursor:pointer;padding:0 12px}
.promote{background:var(--signal);color:#fff;border:0}
.promote:hover{background:var(--signal-dark)}
.reject{background:transparent;border:1px solid var(--line-strong)}
.reject:hover{background:var(--panel)}
button:focus-visible{outline:2px solid var(--signal);outline-offset:2px}
.empty{color:var(--ink-45);padding:24px 0}
</style></head><body>
<h1>Hero review</h1>
<p class="meta" id="meta">loading queue</p>
<select id="layer">
 <option value="beaches">beaches</option>
 <option value="lakes">lakes</option>
 <option value="mountains">mountains</option>
</select>
<div id="sheet" class="sheet"></div>
<div id="queue" class="queue"></div>
<script>
let QUEUE=[],CURRENT=null,REASONS=[];
const esc=s=>String(s).replace(/[&<>"]/g,
 c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
async function loadQueue(){
  const layer=document.getElementById('layer').value;
  const r=await fetch(`/api/queue?layer=${layer}`);const d=await r.json();
  QUEUE=d.queue;
  document.getElementById('meta').textContent=
    `${d.total} rows queued, reviewing as ${d.reviewer}`;
  const q=document.getElementById('queue');q.innerHTML='';
  const bands=['top.json','undecided','weak hero','rest'];
  for(const row of QUEUE){
    const el=document.createElement('div');el.className='qrow';
    el.innerHTML=`<span class="cc">${esc(row.cc)}</span>`+
      `<span>${esc(row.name)}</span>`+
      `<span class="band">${esc(row.why||bands[row.band])}</span>`;
    el.onclick=()=>openRow(row,el);q.appendChild(el);
  }
  if(QUEUE.length)openRow(QUEUE[0],q.firstChild);
  else document.getElementById('sheet').innerHTML=
    '<p class="empty">Nothing queued for this layer</p>';
}
async function openRow(row,el){
  document.querySelectorAll('.qrow.active')
    .forEach(e=>e.classList.remove('active'));
  if(el)el.classList.add('active');
  CURRENT=row;
  const r=await fetch(`/api/row?layer=${row.layer}&cc=${row.cc}`+
    `&key=${encodeURIComponent(row.key)}`);
  const d=await r.json();REASONS=d.reasons;
  const sheet=document.getElementById('sheet');sheet.innerHTML='';
  for(const img of d.images){
    const c=document.createElement('div');
    c.className='cand'+(img.is_hero?' hero':'');
    const veto=img.vetoed?`<div class="veto">veto: ${esc(img.vetoed)}`+
      `</div>`:'';
    c.innerHTML=`<img loading="lazy" src="${esc(img.url)}" alt="">`+
      `<div class="facts">beauty ${img.beauty??'-'}, `+
      `${esc(img.evidence||'legacy')}`+
      `${img.month?', month '+img.month:''}${veto}</div>`+
      `<div class="acts"></div>`;
    const acts=c.querySelector('.acts');
    const p=document.createElement('button');p.className='promote';
    p.textContent=img.is_hero?'Current hero':'Make hero';
    p.disabled=img.is_hero;
    p.onclick=()=>decide(img,'promote','');
    const x=document.createElement('button');x.className='reject';
    x.textContent='Reject';
    x.onclick=()=>{
      const reason=prompt('Reason: '+REASONS.join(', '),REASONS[0]);
      if(reason)decide(img,'reject',reason.trim());
    };
    acts.append(p,x);sheet.appendChild(c);
  }
}
async function decide(img,action,reason){
  const r=await fetch('/api/decision',{method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({layer:CURRENT.layer,cc:CURRENT.cc,
      key:CURRENT.key,file:img.file,action,reason})});
  if(r.ok)openRow(CURRENT,document.querySelector('.qrow.active'));
  else alert('Refused: '+(await r.text()));
}
document.getElementById('layer').onchange=loadQueue;
loadQueue();
</script></body></html>"""


@app.get("/", response_class=HTMLResponse)
def page():
    return PAGE


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--port", type=int, default=8012)
    args = ap.parse_args()
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=args.port)


if __name__ == "__main__":
    main()
