// Builds dist/ from src/ and static/: node tools/build.mjs
//
// The hub caches everything under assets/ for a year without asking again,
// and revalidates every other path on each visit. So every file the page
// loads -- script, stylesheet, fonts, flags -- goes under assets/ with its
// content hash in its name, and a new version still reaches visitors on their
// next load. Only the shell (index.html), the site icons and the licenses live
// outside it.
//
// JS and CSS are minified with esbuild when it can be found (npm i esbuild);
// without it they ship as written, which works the same, only larger.
import { createHash } from "node:crypto"
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"

const root = new URL("..", import.meta.url)
const at = (p) => new URL(p, root)
const hash = (data) => createHash("sha256").update(data).digest("hex").slice(0, 10)

async function loadEsbuild() {
  const req = createRequire(import.meta.url)
  for (const id of ["esbuild", "/opt/npm-tools/node_modules/esbuild"]) {
    try { return req(id) } catch { /* next */ }
  }
  return null
}

export async function build({ quiet = false } = {}) {
  const manifest = JSON.parse(readFileSync(at("theme.json"), "utf8"))
  const { name, short, version, config = [] } = manifest
  const esbuild = await loadEsbuild()

  rmSync(at("dist"), { recursive: true, force: true })
  mkdirSync(at("dist/assets/fonts"), { recursive: true })
  mkdirSync(at("dist/licenses"), { recursive: true })
  for (const f of ["favicon.svg", "apple-touch-icon.png"]) cpSync(at(`static/${f}`), at(`dist/${f}`))

  // fonts: hashed names under assets/fonts/, licenses beside the others
  const fonts = {}
  for (const f of readdirSync(at("static/fonts"))) {
    const data = readFileSync(at(`static/fonts/${f}`))
    if (/\.woff2?$/.test(f)) {
      const out = f.replace(/(\.woff2?)$/, `.${hash(data)}$1`)
      writeFileSync(at(`dist/assets/fonts/${out}`), data)
      fonts[f] = `/assets/fonts/${out}`
    } else if (f.endsWith(".txt")) cpSync(at(`static/fonts/${f}`), at(`dist/licenses/${f}`))
  }

  // flags: one hashed directory per set, so a changed set gets a new URL
  const flagDirs = {}
  for (const [key, dir] of [["grey", "flags"], ["color", "flags-color"]]) {
    const files = readdirSync(at(`static/${dir}`)).filter((f) => f.endsWith(".png")).sort()
    const h = createHash("sha256")
    for (const f of files) h.update(f).update(readFileSync(at(`static/${dir}/${f}`)))
    const out = `${dir}.${h.digest("hex").slice(0, 10)}`
    mkdirSync(at(`dist/assets/${out}`))
    for (const f of files) cpSync(at(`static/${dir}/${f}`), at(`dist/assets/${out}/${f}`))
    flagDirs[key] = `/assets/${out}`
    if (key === "grey") cpSync(at(`static/${dir}/LICENSE-flag-icons.txt`), at("dist/licenses/LICENSE-flag-icons.txt"))
  }

  // stylesheet
  let css = readFileSync(at("src/app.css"), "utf8")
  css = css.replace(/url\("\/fonts\/([^"?]+)"\)/g, (m, f) => (fonts[f] ? `url("${fonts[f]}")` : m))
  if (esbuild) css = esbuild.transformSync(css, { loader: "css", minify: true, legalComments: "none" }).code
  const cssName = `app.${hash(css)}.css`
  writeFileSync(at(`dist/assets/${cssName}`), css)

  // script: settings defaults from theme.json, flag directories from above
  let js = readFileSync(at("src/app.js"), "utf8")
  const importLine = /^import \{ manifest \} from "\.\/manifest\.js"\s*$/m
  const flagLine = /^const FLAG_DIRS = .*$/m
  if (!importLine.test(js)) throw new Error("src/app.js: manifest import not found")
  if (!flagLine.test(js)) throw new Error("src/app.js: FLAG_DIRS not found")
  js = js
    .replace(importLine, `const manifest = ${JSON.stringify({ name, short, version, config })}`)
    .replace(flagLine, `const FLAG_DIRS = ${JSON.stringify(flagDirs)}`)
  if (esbuild) js = esbuild.transformSync(js, { loader: "js", format: "esm", minify: true, target: "es2020", legalComments: "none" }).code
  const jsName = `app.${hash(js)}.js`
  writeFileSync(at(`dist/assets/${jsName}`), js)

  // shell
  let html = readFileSync(at("src/index.html"), "utf8")
  html = html
    .replace('href="/assets/app.css"', `href="/assets/${cssName}"`)
    .replace('src="/assets/app.js"', `src="/assets/${jsName}"`)
    .replace(/href="\/fonts\/([^"?]+)"/g, (m, f) => (fonts[f] ? `href="${fonts[f]}"` : m))
    .replaceAll("__SHORT__", short)
  if (!html.includes(cssName) || !html.includes(jsName)) throw new Error("src/index.html: asset links not found")
  writeFileSync(at("dist/index.html"), html)

  if (!quiet) {
    const kb = (p) => (readFileSync(at(p)).length / 1024).toFixed(1)
    console.log(`dist/ built${esbuild ? " (minified)" : " (esbuild not found: not minified)"}: ` +
      `${jsName} ${kb(`dist/assets/${jsName}`)} KB, ${cssName} ${kb(`dist/assets/${cssName}`)} KB`)
  }
  return { jsName, cssName }
}

if (import.meta.url === `file://${process.argv[1]}`) await build()
