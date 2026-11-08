#!/usr/bin/env bash
# One-time Ubuntu 24.04+ setup for a development checkout. Keeps Chromium's sandbox enabled; permits user
# namespaces only for this checkout's Electron executable. The profile is named nodie-dev so it can coexist
# with the packaged app's /etc/apparmor.d/nodie (for /opt/nodie/nodie).
set -euo pipefail
root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
executable="$root/node_modules/electron/dist/electron"
[[ -x "$executable" ]] || { echo 'Install dependencies first.' >&2; exit 1; }
[[ "$executable" != *'"'* && "$executable" != *$'\n'* ]] || { echo 'Unsupported path' >&2; exit 1; }
profile="$(mktemp)"
trap 'rm -f "$profile"' EXIT
cat > "$profile" <<PROFILE
abi <abi/4.0>,
include <tunables/global>
profile nodie-dev "$executable" flags=(unconfined) {
  userns,
}
PROFILE
cat "$profile"
sudo install -o root -g root -m 0644 "$profile" /etc/apparmor.d/nodie-dev
sudo apparmor_parser -r /etc/apparmor.d/nodie-dev
