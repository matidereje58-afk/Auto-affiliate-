#!/usr/bin/env python3
"""Mine Google autocomplete as a free demand proxy.

For each seed: query seed alone, plus seed + " " + each letter a-z, plus a few
intent modifiers. Collect unique suggestions and count intent signals.

Usage: python3 mine_autocomplete.py "seed one" "seed two" ...
Writes: research/autocomplete/<slug>.json  and prints a compact summary.
"""
import json, os, re, sys, time, urllib.parse, urllib.request

OUT = os.path.join(os.path.dirname(__file__), "autocomplete")
os.makedirs(OUT, exist_ok=True)
UA = "Mozilla/5.0 (compatible; demand-miner/1.0)"

INTENT = ["free", "online", "generator", "maker", "test", "checker", "check",
          "app", "tool", "template", "creator", "website", "how to", "best",
          "vs", "alternative"]

def suggest(q, client="firefox"):
    url = ("https://suggestqueries.google.com/complete/search?client=" + client +
           "&hl=en&q=" + urllib.parse.quote(q))
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read().decode("utf-8", "replace"))
        return data[1] if len(data) > 1 else []
    except Exception as e:
        return []

def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")

def mine(seed):
    queries = [seed] + [f"{seed} {c}" for c in "abcdefghijklmnopqrstuvwxyz"] + \
              [f"{seed} {m}" for m in ["free", "online", "for teachers", "2026", "app"]]
    all_sugg, raw = set(), {}
    for q in queries:
        got = suggest(q)
        raw[q] = got
        for g in got:
            all_sugg.add(g)
        time.sleep(0.12)
    with open(os.path.join(OUT, slug(seed) + ".json"), "w") as f:
        json.dump(raw, f, indent=1, ensure_ascii=False)
    scored = {i: sum(1 for s in all_sugg if i in s.lower()) for i in INTENT}
    with_modifier = {i: sorted([s for s in all_sugg if i in s.lower()])[:8] for i in INTENT}
    return {"seed": seed, "unique_suggestions": len(all_sugg),
            "intent_counts": scored, "examples": with_modifier,
            "all": sorted(all_sugg)}

if __name__ == "__main__":
    for seed in sys.argv[1:]:
        res = mine(seed)
        print("=" * 70)
        print(f"SEED: {res['seed']}   unique_suggestions={res['unique_suggestions']}")
        print("intent:", {k: v for k, v in res["intent_counts"].items() if v})
        for k, v in res["examples"].items():
            if v:
                print(f"  {k}: {v[:5]}")
