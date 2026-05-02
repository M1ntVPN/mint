#!/usr/bin/env bash
# Build sing-box's libbox as an Android `.aar` via gomobile and copy it
# into tauri-plugin-mintvpn/android/libs/.
#
# Required env (with sane defaults):
#   SING_BOX_VERSION   sing-box ref to build (default: v1.13.11)
#   ANDROID_API        gomobile -androidapi (default: 24)
#
# Required tooling on PATH:
#   - go 1.23+
#   - JDK 17 (JAVA_HOME)
#   - Android SDK + NDK (ANDROID_HOME / ANDROID_NDK_HOME)
set -euo pipefail

SING_BOX_VERSION="${SING_BOX_VERSION:-v1.13.11}"
ANDROID_API="${ANDROID_API:-24}"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$REPO_ROOT/tauri-plugin-mintvpn/android/libs"
mkdir -p "$OUT_DIR"

WORK_DIR="$(mktemp -d -t mint-libbox.XXXXXX)"
trap 'rm -rf "$WORK_DIR"' EXIT
echo "[build-libbox] work dir: $WORK_DIR"
echo "[build-libbox] sing-box version: $SING_BOX_VERSION"
echo "[build-libbox] android api: $ANDROID_API"

cd "$WORK_DIR"
git clone --depth 1 --branch "$SING_BOX_VERSION" \
  https://github.com/SagerNet/sing-box.git sing-box
cd sing-box

# Use SagerNet's fork of gomobile — upstream gomobile bind doesn't handle
# sing-box's tags + checklinkname=0 hack.
go install github.com/sagernet/gomobile/cmd/gomobile@latest
go install github.com/sagernet/gomobile/cmd/gobind@latest
GOPATH="${GOPATH:-$HOME/go}"
export PATH="$GOPATH/bin:$PATH"

gomobile init

# Tags follow sing-box's `legacy` android variant (cmd/internal/build_libbox)
# minus tailscale: we don't use NaïveProxy or Tailscale outbounds, and dropping
# them dodges a cronet C++ unwind-table mismatch with current NDK linkers.
TAGS="with_gvisor,with_quic,with_wireguard,with_utls,with_clash_api,badlinkname,tfogo_checklinkname0,with_low_memory"

LDFLAGS="-X github.com/sagernet/sing-box/constant.Version=${SING_BOX_VERSION#v} -X internal/godebug.defaultGODEBUG=multipathtcp=0 -s -w -buildid= -checklinkname=0"

echo "[build-libbox] gomobile bind"
gomobile bind \
  -v \
  -target=android \
  -androidapi="$ANDROID_API" \
  -javapkg=io.nekohasekai \
  -libname=box \
  -trimpath \
  -ldflags="$LDFLAGS" \
  -tags="$TAGS" \
  -o libbox.aar \
  ./experimental/libbox

ls -la libbox.aar
cp libbox.aar "$OUT_DIR/libbox.aar"
echo "[build-libbox] wrote $OUT_DIR/libbox.aar"
