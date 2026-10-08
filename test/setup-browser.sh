#!/usr/bin/env bash
# Prepares a headless Chromium for the end-to-end tests in this folder, without root.
#   bash test/setup-browser.sh
# Downloads the Playwright Chromium build plus the system libraries it needs (extracted
# into /tmp/rootfs, used through LD_LIBRARY_PATH) and fonts.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -d node_modules/playwright ]; then
  npm install --no-audit --no-fund playwright@1.49.1
fi
npx playwright install chromium || true

ROOTFS=/tmp/rootfs
LIBS="libglib2.0-0 libnss3 libnspr4 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 libatspi2.0-0 libx11-6
libxcomposite1 libxdamage1 libxext6 libxfixes3 libxrandr2 libgbm1 libdrm2 libxcb1 libxkbcommon0 libasound2
libcups2 libxau6 libxdmcp6 libbsd0 libmd0 libpango-1.0-0 libpangocairo-1.0-0 libcairo2 libexpat1 libxrender1 libxi6 libxtst6 libepoxy0
libxkbcommon-x11-0 libwayland-client0 libwayland-server0 libwayland-egl1 libegl1 libglx0 libgl1 libopengl0 libvulkan1 libxshmfence1
libxcb-icccm4 libxcb-image0 libxcb-keysyms1 libxcb-util1 libxcb-render-util0 libxcb-xinerama0 libxcb-xinput0
fonts-dejavu-core fonts-dejavu-extra fontconfig fonts-liberation fonts-noto-color-emoji"

if [ ! -d "$ROOTFS/usr/lib/x86_64-linux-gnu" ]; then
  APT="-o Dir::State=/tmp/apt/state -o Dir::State::lists=/tmp/apt/lists -o Dir::Cache=/tmp/apt/cache"
  APT="$APT -o Dir::Etc::sourcelist=/tmp/apt/etc/sources.list -o Dir::Etc::sourceparts=/dev/null"
  mkdir -p /tmp/apt/lists /tmp/apt/cache /tmp/apt/state /tmp/apt/etc /tmp/apt/debs
  printf 'deb http://deb.debian.org/debian bookworm main\ndeb http://deb.debian.org/debian bookworm-updates main\ndeb http://security.debian.org/debian-security bookworm-security main\n' > /tmp/apt/etc/sources.list
  apt-get $APT update >/dev/null 2>&1 || echo 'apt update failed — continuing'
  (cd /tmp/apt/debs && apt-get $APT download $LIBS >/dev/null 2>&1) || echo 'apt download failed — continuing'
  for d in /tmp/apt/debs/*.deb; do dpkg-deb -x "$d" "$ROOTFS" 2>/dev/null || true; done
fi

cat > /tmp/fonts.conf <<'XML'
<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig><dir>/tmp/rootfs/usr/share/fonts</dir><cachedir>/tmp/fontcache</cachedir><config></config></fontconfig>
XML
mkdir -p /tmp/fontcache
echo 'browser ready — run: node test/e2e.mjs'
