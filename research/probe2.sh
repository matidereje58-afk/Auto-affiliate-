#!/usr/bin/env bash
set -u
OUT=/workspace/research/autocomplete
mkdir -p "$OUT"
UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
fetch() {
  local client="$1" q="$2"
  local slug; slug=$(printf '%s' "$q" | tr ' /?&=' '_____' | tr -cd '[:alnum:]_.-')
  curl -s --max-time 12 -A "$UA" \
    "https://suggestqueries.google.com/complete/search?client=${client}&hl=en&q=$(printf '%s' "$q" | jq -sRr @uri)" \
    -o "$OUT/${client}__${slug}.json" || true
  sleep 0.2
}
SEEDS=(
  "what do websites know about me" "browser fingerprint" "how unique is my browser" "privacy test"
  "what can websites see about me" "canvas fingerprint" "am i being tracked" "device fingerprint"
  "ai visibility" "am i cited" "is my website cited by ai" "how do i show up in chatgpt"
  "get cited by ai" "ai search visibility" "llm visibility" "brand visibility chatgpt"
  "gamepad tester" "stick drift test" "controller drift" "polling rate test" "mouse polling rate"
  "input lag test" "keyboard latency" "hdr test" "is my monitor hdr" "speaker test"
  "surround sound test" "audio channel test" "webcam test" "dead pixel test" "monitor color test"
  "is my image ai" "ai image detector" "deepfake test" "ai text detector" "is this essay ai"
  "how much is my house worth" "home value" "medical bill check" "medical bill error"
  "ats resume checker" "resume score" "cover letter" "contract generator" "invoice generator"
  "llms.txt" "robots.txt" "ai crawler" "block ai bots" "mcp server" "agent readiness"
)
for s in "${SEEDS[@]}"; do fetch firefox "$s"; fetch chrome "$s"; done
for s in "what do websites know about me" "browser fingerprint" "ai visibility" "gamepad tester" "hdr test"; do
  for a in a b c d e f g h i j k l m n o p q r s t u v w x y z; do fetch firefox "$s $a"; done
done
echo "PROBE2 DONE $(ls -1 $OUT | wc -l)"
