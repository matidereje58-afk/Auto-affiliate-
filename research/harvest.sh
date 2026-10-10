#!/usr/bin/env bash
# Autocomplete demand-proxy harvester. Saves raw JSON under /workspace/research/autocomplete/
set -u
OUT=/workspace/research/autocomplete
mkdir -p "$OUT"
UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

# fetch a query, save raw json. args: client qlabel query
fetch() {
  local client="$1" q="$2"
  local slug
  slug=$(printf '%s' "$q" | tr ' /?&=' '_____' | tr -cd '[:alnum:]_.-')
  local f="$OUT/${client}__${slug}.json"
  curl -s --max-time 12 -A "$UA" \
    "https://suggestqueries.google.com/complete/search?client=${client}&hl=en&q=$(printf '%s' "$q" | jq -sRr @uri)" \
    -o "$f" || true
  sleep 0.25
}

SEEDS=(
  # A device/permission diagnostics
  "mic test" "camera test" "webcam test" "keyboard test" "typing test" "keyboard latency test"
  "dead pixel test" "screen test" "monitor test" "refresh rate test" "hz test" "ufo test"
  "gamepad test" "controller test" "joystick test" "speaker test" "surround sound test" "left right speaker test"
  "internet speed test" "connection test" "ping test" "jitter test" "packet loss test"
  "battery health check" "battery drain test" "gpu bottleneck calculator" "is my monitor hdr"
  "clipboard transfer" "phone as webcam" "browser fingerprint test" "what do websites know about me"
  "what is my screen resolution" "what is my ip" "is my mic working" "test my microphone"
  "scroll test" "mouse test" "double click test" "touch screen test" "vpn leak test" "dns leak test"
  # B education/classroom
  "bingo card generator" "word search generator" "crossword generator" "worksheet generator"
  "seating chart generator" "random group generator" "escape room generator" "exit ticket generator"
  "quiz generator" "spinner wheel" "random name picker" "flashcard generator" "math worksheet generator"
  # C creator/utility generators
  "link in bio" "qr code generator" "invitation maker" "rsvp page" "poll maker" "anonymous message"
  "countdown timer" "wedding games" "baby shower games" "quiz maker" "bio link generator" "qr code menu"
  # D AI-era
  "ai detector" "ai content detector" "is this ai written" "chatgpt detector" "ai image detector"
  "is this image ai" "deepfake detector" "llms.txt generator" "robots.txt generator" "ai crawler blocker"
  "prompt optimizer" "ai cost calculator" "mcp server" "am i cited by chatgpt" "ai visibility checker"
  "geo ai optimization" "watermark remover" "ai humanizer" "how to block ai crawlers"
  # E finance/legal/health high rpm
  "contract generator" "invoice generator" "cover letter generator" "resume ats checker"
  "dispute letter generator" "demand letter generator" "bill negotiation" "insurance claim letter"
  "how much is my house worth" "home value estimate" "salary comparison" "offer comparison"
  "medical bill" "benefits decoder" "lease agreement generator" "nda generator" "power of attorney form"
  # F weird/high volume mundane
  "am i down" "is it down" "is x down" "how many days until" "how much is my car worth"
  "how much data do i need" "what is my screen resolution" "what is my browser" "what is my user agent"
  "when is" "how long until" "what day is it"
)

for s in "${SEEDS[@]}"; do
  fetch firefox "$s"
  fetch chrome "$s"
done

# alphabet-soup expansion for the high-value diagnostics + education + AI seeds
EXPAND=("mic test" "camera test" "dead pixel" "refresh rate" "internet speed test" "gamepad test" \
        "bingo card" "word search" "crossword" "seating chart" "spinner wheel" "random name" \
        "qr code" "link in bio" "ai detector" "ai image detector" "llms.txt" "robots.txt" \
        "resume ats" "contract generator" "dispute letter" "medical bill" "how much is my car worth" \
        "how many days until" "is it down" "what is my ip")
ALPHA=(a b c d e f g h i j k l m n o p q r s t u v w x y z 0 1 2 3 4 5 6 7 8 9)
for s in "${EXPAND[@]}"; do
  for a in "${ALPHA[@]}"; do
    fetch firefox "$s $a"
  done
done

# year/context modifiers on a few seeds
for s in "mic test" "camera test" "bingo card generator" "ai detector" "resume ats checker" "qr code generator"; do
  fetch firefox "$s 2026"
  fetch firefox "$s online"
  fetch firefox "$s free"
  fetch firefox "$s for"
done
echo "DONE $(ls -1 $OUT | wc -l) files"
