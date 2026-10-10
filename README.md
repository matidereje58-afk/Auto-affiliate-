# The Idea: GuestPass — a free tool where every user brings 100+ visitors

**Read `IDEA.md` first.** It is the deliverable: one novel, ad-monetized, zero-budget side hustle
with an architecture that makes traffic self-generating.

| File | What it is |
|---|---|
| **`IDEA.md`** | The strategy: the idea, the architecture (6 loops), the money math, the ad-network ladder, the build spec, the day-1 launch playbook, the risks and kill criteria, and 5 scored runner-up ideas. |
| **`prototype/`** | A **working prototype** of the core mechanic (no build step, no server): create an event, every guest gets a personal pass, message wall, QR card, host console, and the growth-loop footer. Open `prototype/index.html`. |
| `research/ad-economics.md` | Verified 2026 ad economics: network thresholds (AdSense / Journey 1k sessions / Raptive 25k PV / Mediavine $5k / Ezoic 250k MAU), RPM envelopes by vertical, pageview-to-revenue tables, and the exact Google policies that constrain a free-tool site. |
| `research/whitespace.md` | Independent demand mining: 1,407 autocomplete query sets -> 10,872 unique suggestions, ranked into 11 intent buckets, plus the action-modifier analysis. |
| `research/autocomplete/` | Raw demand data (thousands of JSON files) so every demand claim is auditable. |
| `research/mine_autocomplete.py` | The tool that produced it - run it on any seed to check demand yourself. |

## The one-paragraph version

Stop trying to *buy* or *rank* your way to traffic. Build a tiny free tool that a **host** uses
(wedding, birthday, baby shower, graduation, company offsite) and that forces every **guest** to
open your URL to get their personal pass: table number, schedule, menu, message wall. One host =
100-300 visitors x 4-6 visits x 3-5 real pages, all at wedding-vertical RPM ($15-40 in Tier-1
countries), on free-tier infrastructure with zero marginal cost. Every pass page carries
"make your own free pass" - and the people reading it are the most likely population on earth to
host their own big event within 24 months. That footer is the business model.