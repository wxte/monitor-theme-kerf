// Builds static/os.svg, the operating-system icon sprite, from Simple Icons
// (CC0 1.0, https://github.com/simple-icons/simple-icons):
//   node tools/os-sprite.mjs <simple-icons>/icons
// The marks remain trademarks of their owners; they are shown only to say
// which system a server runs. Windows is a plain window glyph of our own.
import { readFileSync, writeFileSync } from "node:fs"

const dir = process.argv[2]
if (!dir) { console.error("usage: node tools/os-sprite.mjs <simple-icons>/icons"); process.exit(1) }
const ICONS = ["debian", "ubuntu", "centos", "almalinux", "rockylinux", "redhat", "fedora", "alpinelinux",
  "archlinux", "manjaro", "opensuse", "linuxmint", "gentoo", "nixos", "kalilinux", "openwrt", "proxmox",
  "deepin", "voidlinux", "android", "freebsd", "apple", "linux"]
const out = ICONS.map((id) => {
  const svg = readFileSync(`${dir}/${id}.svg`, "utf8")
  const d = svg.match(/<path d="([^"]+)"/)[1]
  return `<symbol id="${id}" viewBox="0 0 24 24"><path d="${d}"/></symbol>`
})
out.push('<symbol id="windows" viewBox="0 0 24 24"><path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h15A1.5 1.5 0 0 1 21 4.5v15a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19.5zM5 8v11h14V8z"/></symbol>')
writeFileSync(new URL("../static/os.svg", import.meta.url),
  `<svg xmlns="http://www.w3.org/2000/svg">${out.join("")}</svg>\n`)
console.log(`static/os.svg: ${out.length} icons`)
