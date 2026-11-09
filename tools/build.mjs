// Builds dist/ from src/ and static/. No dependencies: node tools/build.mjs
//
// Every file the page loads gets its content hash in its URL (app.3f9a1c2b.js,
// kerf.woff?v=…), so a new version reaches visitors on their next page load
// instead of waiting for the browser's cache of the old file to expire. The
// operator's settings defaults come from theme.json and are inlined into app.js.
import { createHash } from "node:crypto"
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"

const root = new URL("..", import.meta.url)
const at = (p) => new URL(p, root)
const hash = (data) => createHash("sha256").update(data).digest("hex").slice(0, 10)

export function build({ quiet = false } = {}) {
  const manifest = JSON.parse(readFileSync(at("theme.json"), "utf8"))
  const { name, short, version, config = [] } = manifest

  rmSync(at("dist"), { recursive: true, force: true })
  mkdirSync(at("dist/assets"), { recursive: true })
  cpSync(at("static"), at("dist"), { recursive: true })

  // fonts keep their fixed names (the license files sit beside them) and get a version query
  const fontV = {}
  for (const f of readdirSync(at("static/fonts"))) {
    if (f.endsWith(".woff") || f.endsWith(".woff2")) fontV[f] = hash(readFileSync(at(`static/fonts/${f}`)))
  }
  const fontUrl = (f) => `/fonts/${f}?v=${fontV[f]}`

  let css = readFileSync(at("src/app.css"), "utf8")
  css = css.replace(/url\("\/fonts\/([^"?]+)"\)/g, (m, f) => (fontV[f] ? `url("${fontUrl(f)}")` : m))
  const cssName = `app.${hash(css)}.css`
  writeFileSync(at(`dist/assets/${cssName}`), css)

  let js = readFileSync(at("src/app.js"), "utf8")
  const importLine = /^import \{ manifest \} from "\.\/manifest\.js"\s*$/m
  if (!importLine.test(js)) throw new Error("src/app.js: manifest import not found")
  js = js.replace(importLine,
    `// generated from theme.json by tools/build.mjs\nconst manifest = ${JSON.stringify({ name, short, version, config })}`)
  const jsName = `app.${hash(js)}.js`
  writeFileSync(at(`dist/assets/${jsName}`), js)

  let html = readFileSync(at("src/index.html"), "utf8")
  html = html
    .replace('href="/assets/app.css"', `href="/assets/${cssName}"`)
    .replace('src="/assets/app.js"', `src="/assets/${jsName}"`)
    .replace(/href="\/fonts\/([^"?]+)"/g, (m, f) => (fontV[f] ? `href="${fontUrl(f)}"` : m))
  if (!html.includes(cssName) || !html.includes(jsName)) throw new Error("src/index.html: asset links not found")
  writeFileSync(at("dist/index.html"), html)

  if (!quiet) console.log(`dist/ built: ${jsName}, ${cssName}`)
  return { jsName, cssName }
}

if (import.meta.url === `file://${process.argv[1]}`) build()
