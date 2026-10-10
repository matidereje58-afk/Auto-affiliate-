#!/usr/bin/env python3
"""Extract actionable / problem / commercial intent modifiers from the suggestion graph."""
import json, os, glob, collections, re

OUT = "/workspace/research/autocomplete"
files = [f for f in sorted(glob.glob(os.path.join(OUT, "*.json"))) if os.path.getsize(f) > 2]

sug = collections.Counter()
seed_map = collections.defaultdict(set)
for f in files:
    try:
        data = json.load(open(f, encoding="utf-8", errors="replace"))
    except Exception:
        continue
    if not (isinstance(data, list) and len(data) > 1 and isinstance(data[1], list)):
        continue
    seed = os.path.basename(f).split("__", 1)[-1].replace(".json", "")
    for s in data[1]:
        if isinstance(s, str):
            sug[s] += 1
            seed_map[s].add(seed)

MODS = {
    "free": r"\bfree\b",
    "online": r"\bonline\b",
    "generator": r"\bgenerator\b|\bmaker\b|\bcreator\b|\bbuilder\b",
    "checker/test": r"\bchecker\b|\btester\b|\btest\b|\bcheck\b",
    "how-to": r"\bhow to\b|\bhow do\b|\bhow can\b",
    "not-working/fix": r"\bnot working\b|\bfix\b|\bproblem\b|\berror\b|\bwhy is\b|\bstuck\b|\bfailed\b",
    "alternative": r"\balternative\b|\bvs\b|\bbetter than\b|\binstead of\b",
    "template/example": r"\btemplate\b|\bexample\b|\bsample\b",
    "for-teachers": r"\bteacher\b|\bclassroom\b|\bstudent\b|\bfor kids\b|\bpreschool\b|\belementary\b",
    "download/print": r"\bdownload\b|\bprint\b|\bprintable\b|\bpdf\b",
    "ai-era": r"\bai\b|\bchatgpt\b|\bllm\b|\bprompt\b|\bdeepfake\b|\bwatermark\b",
    "mine/private": r"\bmy\b|\bmine\b|\bpersonal\b|\bmy own\b",
}
mod_count = collections.Counter()
mod_examples = collections.defaultdict(list)
for s, c in sug.items():
    for name, pat in MODS.items():
        if re.search(pat, s, re.I):
            mod_count[name] += 1
            if len(mod_examples[name]) < 40:
                mod_examples[name].append(s)

print("=== MODIFIER FREQUENCY across unique suggestions ===")
for m, c in mod_count.most_common():
    print(f"{c:5d}  {m}")

with open("/workspace/research/modifiers.txt", "w", encoding="utf-8") as fh:
    for m, c in mod_count.most_common():
        fh.write(f"\n### {m} ({c})\n")
        for s in sorted(set(mod_examples[m])):
            fh.write(f"  {s}\n")
print("\nwrote /workspace/research/modifiers.txt")
print(f"\ntotal unique suggestions: {len(sug)}")
