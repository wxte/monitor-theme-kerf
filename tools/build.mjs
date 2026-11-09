// Writes dist/assets/manifest.js from theme.json, so the theme's setting
// defaults live in one place. Run before packing: node tools/build.mjs
import { readFileSync, writeFileSync } from "node:fs"
const root = new URL("..", import.meta.url)
const manifest = JSON.parse(readFileSync(new URL("theme.json", root), "utf8"))
const { name, short, version, config = [] } = manifest
writeFileSync(new URL("dist/assets/manifest.js", root),
  `// generated from theme.json by tools/build.mjs — do not edit\nexport const manifest = ${JSON.stringify({ name, short, version, config }, null, 2)}\n`)
console.log("manifest.js written")
