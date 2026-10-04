#!/usr/bin/env bash
# Installs headless Blender (5.2.2 LTS) to /opt/blender.
# Needed because the sandbox filesystem may reset between sessions.
set -euo pipefail

VER=5.2.2
DEST=/opt/blender
TARBALL_URL="https://download.blender.org/release/Blender${VER%.*}/blender-${VER}-linux-x64.tar.xz"

if [ -x "$DEST/blender-${VER}-linux-x64/blender" ]; then
  echo "already installed: $("$DEST/blender-${VER}-linux-x64/blender" --version | head -1)"
  exit 0
fi

echo "installing runtime libraries"
apt-get update -qq || true
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
  libgl1 libice6 libsm6 libxfixes3 libxi6 libxkbcommon0 libxxf86vm1 libxrender1 libxext6

echo "downloading blender ${VER}"
mkdir -p "$DEST"
curl -sSL -o "$DEST/blender.tar.xz" "$TARBALL_URL"

echo "extracting (python lzma: no xz binary in this image)"
python3 - "$DEST" <<'PY'
import sys, tarfile
dest = sys.argv[1]
with tarfile.open(f"{dest}/blender.tar.xz", "r:xz") as tf:
    tf.extractall(dest)
PY
rm -f "$DEST/blender.tar.xz"
chmod -R +x "$DEST/blender-${VER}-linux-x64/"

ln -sf "$DEST/blender-${VER}-linux-x64/blender" /usr/local/bin/blender
"$DEST/blender-${VER}-linux-x64/blender" --version | head -1