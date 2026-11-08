#!/usr/bin/env bash
# Install or update the Nod.ie .deb system-wide. Run by an administrator.
#
#   sudo ./install-system.sh nodie_<ver>_amd64.deb <expected-sha256>
#
# Take the expected SHA256 from the release's SHA256SUMS, obtained separately from
# the .deb, so a tampered file is refused. Installs to /opt/nodie with an AppArmor
# profile granting user namespaces to that root-owned binary only (Chromium's
# sandbox on Ubuntu 24.04+). Never run Nod.ie with --no-sandbox.
set -euo pipefail

die() { echo "install-system: $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "run with sudo"
[[ $# -eq 2 ]] || die "usage: sudo $0 <path/to/nodie_VER_amd64.deb> <sha256>"
deb=$1
expected=${2,,}
[[ -f $deb ]] || die "no such file: $deb"
[[ $expected =~ ^[0-9a-f]{64}$ ]] || die "second argument must be a 64-character SHA256"

# Work on a root-owned copy so the file can't be swapped between check and install.
tmp=$(mktemp -d /var/tmp/nodie-install.XXXXXX)
trap 'rm -rf "$tmp"' EXIT
cp -- "$deb" "$tmp/pkg.deb"
chmod 644 "$tmp/pkg.deb"
deb=$tmp/pkg.deb

actual=$(sha256sum -- "$deb" | cut -d' ' -f1)
[[ $actual == "$expected" ]] || die "SHA256 mismatch: expected $expected, got $actual. Refusing to install."

pkg=$(dpkg-deb --field "$deb" Package)
ver=$(dpkg-deb --field "$deb" Version)
[[ $pkg == nodie ]] || die "unexpected package name: $pkg"
contents=$(dpkg-deb --contents "$deb" | awk '{print $6}')
grep -qx './opt/nodie/nodie' <<<"$contents" || die "package doesn't install to /opt/nodie"
grep -qx './opt/nodie/resources/apparmor-profile' <<<"$contents" || die "package has no AppArmor profile"

echo "Installing $pkg $ver (SHA256 verified)…"
apt-get install -y --no-install-recommends "$deb"

if [[ ! -f /etc/apparmor.d/nodie ]] || ! grep -q '"/opt/nodie/nodie"' /etc/apparmor.d/nodie; then
  apt-get remove -y nodie || true
  die "AppArmor profile for /opt/nodie/nodie missing after install; removed the package again"
fi
echo
echo "Installed $pkg $ver to /opt/nodie (launch: nodie, window class: nodie)."
echo "Settings stay in each user's ~/.config/nodie; packaged builds read ~/.config/nodie/.env."
