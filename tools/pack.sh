#!/usr/bin/env sh
# Package the installable theme: dist/ beside theme.json and preview.png,
# exactly the layout the hub reads a theme from. Output: theme.tar.gz
set -eu
cd "$(dirname "$0")/.."

node tools/build.mjs

# theme.json: the six string fields must all be present (the hub rejects otherwise)
node -e '
const t = require("./theme.json")
for (const k of ["name", "short", "description", "version", "author", "url"]) {
  if (typeof t[k] !== "string") { console.error(`theme.json: ${k} must be a string`); process.exit(1) }
}
if (!t.name || !/^[A-Za-z0-9_-]+$/.test(t.short)) { console.error("theme.json: name/short invalid"); process.exit(1) }
'

[ -f dist/index.html ] || { echo "dist/index.html missing"; exit 1; }
find dist -type l | grep -q . && { echo "symlinks are rejected by the hub"; exit 1; }

rm -f theme.tar.gz
tar czf theme.tar.gz dist theme.json preview.png
# the hub checks the gzip trailer: a truncated archive is refused
gzip -t theme.tar.gz
echo "theme.tar.gz $(wc -c < theme.tar.gz) bytes"
