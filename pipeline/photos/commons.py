"""Pull MORE from Commons, not the same amount: the funnel, widened.

Three widenings, each with the cap that makes it safe:

  category recursion, depth 2   Category:Loch Maree often holds few files
      while Category:Loch Maree in winter holds many. Depth is capped at
      2 and the member walk at MAX_SUBCATS, because category drift is
      real: the relevance gate downstream is what guards against a
      subcategory wandering off-subject, and this module only ever ADDS
      candidates for that gate to judge.
  geosearch to the ceiling      gsradius is hard-capped by the API at
      10..10000 m and gslimit at 500 (5000 with a bot flag). The clamp
      lives here so no caller ever earns an API error for asking bigger.
  maxlag on bulk jobs           &maxlag=5 makes a bulk pass yield to
      replication lag automatically. Wikimedia's 2024 API policy update
      tightened automated access; a crawler that backs off by itself is
      the one that keeps its access.

Politeness stays where it lives: these helpers take the layer's own
`mediawiki` callable, so the shared pacer, the retry lore and the per
layer user agent all still apply. Requesting a bot flag (which quadruples
gslimit and raises titles-per-request to 500) is an account action on
Commons, not a code change; PHOTOS.md tracks it.

ASCII clean, no em dashes, per project convention.
"""

GEOSEARCH_RADIUS_MIN = 10
GEOSEARCH_RADIUS_MAX = 10000
GEOSEARCH_LIMIT = 500          # 5000 once the account carries a bot flag
TITLES_PER_REQ = 50            # 500 with a bot flag
CAT_DEPTH = 2
MAX_SUBCATS = 40               # per level; a deeper tree than this is drift
MAXLAG = 5


def with_maxlag(params):
    """Bulk-job parameters: the same call, yielding to replication lag."""
    out = dict(params)
    out.setdefault("maxlag", MAXLAG)
    return out


def category_files(mediawiki, category, depth=CAT_DEPTH,
                   files_per_cat=100):
    """Files in a category tree, walked to `depth`, deduplicated.

    Returns [{"title": ..., "from_cat": category-it-was-found-in}]. The
    caller's relevance gate decides what the walk was worth; this only
    widens what it gets to judge. `category` with or without the
    "Category:" prefix."""
    root = category if str(category).startswith("Category:") \
        else f"Category:{category}"
    seen_cats, seen_files, out = {root}, set(), []
    frontier = [root]
    for level in range(depth + 1):
        next_frontier = []
        for cat in frontier:
            cont = {}
            while True:
                res = mediawiki(with_maxlag({
                    "action": "query", "list": "categorymembers",
                    "cmtitle": cat, "cmtype": "file|subcat",
                    "cmlimit": min(files_per_cat, 500), **cont,
                })) or {}
                members = (res.get("query") or {}).get(
                    "categorymembers") or []
                for member in members:
                    title = member.get("title") or ""
                    if title.startswith("Category:"):
                        if (level < depth and title not in seen_cats
                                and len(next_frontier) < MAX_SUBCATS):
                            seen_cats.add(title)
                            next_frontier.append(title)
                    elif title not in seen_files:
                        seen_files.add(title)
                        out.append({"title": title, "from_cat": cat})
                cont = res.get("continue") or {}
                if not cont or len(out) >= files_per_cat * 4:
                    break
            if len(out) >= files_per_cat * 4:
                break
        frontier = next_frontier
        if not frontier:
            break
    return out


def geosearch_files(mediawiki, lat, lon, radius_m,
                    limit=GEOSEARCH_LIMIT):
    """Files with a coordinate near a point, at the API's real ceiling.

    The radius clamp is the documented hard cap, not a preference. What
    comes back carries NO subject claim at all: every hit is a `geo`
    candidate until the evidence gate says otherwise."""
    radius = max(GEOSEARCH_RADIUS_MIN,
                 min(GEOSEARCH_RADIUS_MAX, int(radius_m)))
    res = mediawiki(with_maxlag({
        "action": "query", "list": "geosearch",
        "gscoord": f"{lat}|{lon}", "gsradius": radius,
        "gslimit": min(limit, GEOSEARCH_LIMIT), "gsnamespace": 6,
    })) or {}
    hits = (res.get("query") or {}).get("geosearch") or []
    return [{"title": h.get("title") or "", "geo": True} for h in hits]
