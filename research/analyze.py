#!/usr/bin/env python3
"""Aggregate Google autocomplete suggestion graph dumps into a demand-signal table."""
import json, os, re, glob, collections, sys

OUT = "/workspace/research/autocomplete"
files = sorted(glob.glob(os.path.join(OUT, "*.json")))
files = [f for f in files if os.path.getsize(f) > 2]

sug_count = collections.Counter()      # exact suggestion -> times seen across seeds
head_count = collections.Counter()     # first suggestion (head) per seed
file_ok = 0
parse_err = 0
rows = []

for f in files:
    try:
        with open(f, encoding="utf-8", errors="replace") as fh:
            data = json.load(fh)
    except Exception:
        parse_err += 1
        continue
    if not isinstance(data, list) or len(data) < 2 or not isinstance(data[1], list):
        continue
    file_ok += 1
    seed = os.path.basename(f).split("__", 1)[-1].replace(".json", "")
    sugg = [s for s in data[1] if isinstance(s, str)]
    for s in sugg:
        sug_count[s] += 1
    if sugg:
        head_count[sugg[0]] += 1
    rows.append((seed, sugg))

# intent clusters via keyword buckets
BUCKETS = {
    "device/mic-cam": ["mic", "microphone", "camera", "webcam", "speaker", "headphone", "sound"],
    "device/display": ["screen", "monitor", "pixel", "refresh", "hz", "resolution", "brightness", "hdr", "dead pixel"],
    "device/input-latency": ["keyboard", "mouse", "typing", "gamepad", "controller", "joystick", "latency", "polling", "scroll", "double click", "touch"],
    "net-diagnostics": ["speed test", "ping", "jitter", "packet loss", "connection", "internet", "wifi", "dns", "vpn", "bandwidth", "upload", "download"],
    "privacy-fingerprint": ["fingerprint", "what do websites know", "what is my ip", "user agent", "browser", "tracker", "leak"],
    "edu-generators": ["bingo", "word search", "crossword", "worksheet", "seating chart", "group", "random name", "spinner", "exit ticket", "escape room", "flashcard", "quiz", "worksheet"],
    "creator-utility": ["qr code", "link in bio", "bio link", "poll", "rsvp", "invitation", "countdown", "anonymous message", "quiz maker", "menu"],
    "ai-detection": ["ai detector", "ai content", "ai image", "is this ai", "deepfake", "chatgpt detector", "humanizer", "watermark"],
    "ai-visibility": ["llms.txt", "robots.txt", "crawler", "cited", "ai visibility", "geo ", "generative engine", "mcp", "agent", "prompt optimizer", "ai cost"],
    "finance-legal": ["contract", "invoice", "cover letter", "resume", "ats", "dispute", "demand letter", "insurance claim", "bill", "lease", "nda", "power of attorney", "salary", "offer letter", "benefits", "house worth", "home value", "car worth"],
    "mundane": ["is it down", "am i down", "days until", "how long until", "how much data", "what day"],
}

def bucket_of(s):
    sl = " " + s.lower() + " "
    hits = [b for b, kws in BUCKETS.items() if any(k in sl for k in kws)]
    return hits

bucket_count = collections.Counter()
bucket_sug = collections.defaultdict(collections.Counter)
for s, c in sug_count.items():
    for b in bucket_of(s):
        bucket_count[b] += c
        bucket_sug[b][s] += c

print(f"files_total={len(files)} files_ok={file_ok} parse_err={parse_err} unique_suggestions={len(sug_count)}")
print("\n=== INTENT BUCKET TOTALS (sum of suggestion appearances) ===")
for b, c in bucket_count.most_common():
    print(f"{c:6d}  {b}")

print("\n=== TOP 60 SUGGESTIONS (cross-seed frequency) ===")
for s, c in sug_count.most_common(60):
    print(f"{c:4d}  {s}")

print("\n=== TOP HEADS (most repeated first-suggestion) ===")
for s, c in head_count.most_common(30):
    print(f"{c:4d}  {s}")

# write per-bucket top suggestions
with open("/workspace/research/buckets.txt", "w", encoding="utf-8") as fh:
    for b in sorted(bucket_count, key=lambda x: -bucket_count[x]):
        fh.write(f"\n### {b} (total {bucket_count[b]})\n")
        for s, c in bucket_sug[b].most_common(25):
            fh.write(f"  {c:4d}  {s}\n")
print("\nwrote /workspace/research/buckets.txt")
