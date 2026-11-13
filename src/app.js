// Kerf — public status page theme for monitor.
// Plain ES module, no dependencies. Every string that comes from the hub or from
// a node goes into the page through textContent, never as markup.
import { manifest } from "./manifest.js"
import { MAP } from "./map-data.js"

/* ════════════════════════ DOM helpers ════════════════════════ */

const SVG_NS = "http://www.w3.org/2000/svg"

/** h("div", { class: "x", text: "y", on: { click } }, ...children) */
function h(tag, props, ...kids) {
  const el = document.createElement(tag)
  apply(el, props)
  append(el, kids)
  return el
}
function s(tag, props, ...kids) {
  const el = document.createElementNS(SVG_NS, tag)
  apply(el, props)
  append(el, kids)
  return el
}
function apply(el, props) {
  if (!props) return
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue
    if (k === "class") el.setAttribute("class", v)
    else if (k === "text") el.textContent = v
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v)
    else if (k === "on") for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn)
    else if (k === "ref") v(el)
    else el.setAttribute(k, v === true ? "" : String(v))
  }
}
function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue
    el.append(k instanceof Node ? k : document.createTextNode(String(k)))
  }
}
const setText = (el, t) => { if (el && el.textContent !== t) el.textContent = t }

/* ── motion ── */
const calm = matchMedia("(prefers-reduced-motion: reduce)")
const motionOK = () => !calm.matches
const NUM = /^([^\d-]*)(-?\d+(?:\.\d+)?)(.*)$/s
// overshoots a little, then settles: the springy part of every animation here
const easeOutBack = (t) => { const c = 1.6; return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2 }

/**
 * Like setText, but a number that changes rolls to its new value with a small
 * overshoot, and briefly lights up. Kept for figures that change rarely (the
 * latency, once a minute): on the 2-second figures it would never stop moving.
 */
function setNum(el, text) {
  if (!el) return
  const prev = el.__shown ?? el.textContent
  if (el.__target === text) return
  el.__target = text
  const a = NUM.exec(prev), b = NUM.exec(text)
  cancelAnimationFrame(el.__raf)
  if (!a || !b || a[1] !== b[1] || a[3] !== b[3] || a[2] === b[2] || calm.matches || document.hidden) {
    el.textContent = text
    el.__shown = text
    return
  }
  const from = parseFloat(a[2]), to = parseFloat(b[2])
  const digits = (b[2].split(".")[1] || "").length
  const t0 = performance.now(), dur = 900
  el.classList.remove("bump")
  void el.offsetWidth
  el.classList.add("bump")
  setTimeout(() => el.classList.remove("bump"), 1200)
  const step = (now) => {
    const t = Math.min(1, (now - t0) / dur)
    let v = from + (to - from) * easeOutBack(t)
    if (from >= 0 && to >= 0) v = Math.max(0, v)
    el.__shown = t < 1 ? `${b[1]}${v.toFixed(digits)}${b[3]}` : text
    el.textContent = el.__shown
    if (t < 1) el.__raf = requestAnimationFrame(step)
  }
  el.__raf = requestAnimationFrame(step)
}

/** Items float up one after another; restarted when the list they belong to changes. */
function enter(el, i) {
  if (calm.matches) return
  el.classList.remove("enter")
  void el.offsetWidth
  el.style.animationDelay = `${Math.min(i, 12) * 45}ms`
  el.classList.add("enter")
  // once played, the class goes: a node the browser re-attaches would replay it
  const done = (e) => {
    if (e.target !== el) return
    el.classList.remove("enter")
    el.style.animationDelay = ""
    el.removeEventListener("animationend", done)
  }
  el.addEventListener("animationend", done)
}

/**
 * Put `el` at position `i` of `parent` only when it is not already there.
 * Moving a node detaches and re-attaches it, which restarts every CSS
 * animation inside it; done on every push, that reads as a flicker.
 */
function place(parent, el, i) {
  const at = parent.children[i]
  if (at !== el) parent.insertBefore(el, at || null)
}
const clear = (el) => { while (el.firstChild) el.firstChild.remove() }

/* ════════════════════════ formatting ════════════════════════ */

const UNITS = ["B", "KB", "MB", "GB", "TB", "PB"]
function bytes(n, digits) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—"
  let i = 0
  let v = Math.abs(n)
  while (v >= 1024 && i < UNITS.length - 1) { v /= 1024; i++ }
  const d = digits ?? (i === 0 || v >= 100 ? 0 : v >= 10 ? 1 : 2)
  return `${(Math.sign(n) * v).toFixed(d)} ${UNITS[i]}`
}
/** A capacity: whole numbers lose their decimals, 1.00 GB → 1 GB. */
const size = (n) => bytes(n).replace(/\.0+ /, " ")
const rate = (n) => `${bytes(n)}/s`
const rateShort = (n) => (!(n >= 1024) ? `${Math.round(n || 0)}B` : bytes(n, n >= 1024 * 100 ? 0 : 1).replace(" ", "").replace(/([KMGTP])B$/, "$1")) + "/s"
const pct = (v, d = 1) => (typeof v === "number" && Number.isFinite(v) ? `${v.toFixed(d)}%` : "—")
const ratio = (a, b) => (b > 0 ? (a / b) * 100 : null)

function uptime(sec) {
  if (typeof sec !== "number" || !Number.isFinite(sec) || sec < 0) return "—"
  if (sec >= 86400) return `${Math.floor(sec / 86400)} 天`
  if (sec >= 3600) return `${Math.floor(sec / 3600)} 小时`
  if (sec >= 60) return `${Math.floor(sec / 60)} 分钟`
  return `${Math.floor(sec)} 秒`
}

const osName = (name = "") => String(name).replace("GNU/Linux ", "").replace(/\s*\([^)]*\)\s*$/, "")
const cpuName = (name = "") =>
  String(name).replace(/\((R|TM|r|tm)\)/g, "").replace(/\s+(CPU|Processor)\b/g, "")
    .replace(/\s+\d+-Core\b/g, "").replace(/\s+/g, " ").trim()

const MONEY = new Map()
function money(amount, currency) {
  try {
    // whole amounts drop the decimals (US$49), others keep up to two (€4.50)
    const whole = Number.isInteger(amount)
    const key = `${currency}:${whole}`
    let f = MONEY.get(key)
    if (!f) {
      // zh-CN fixed: US$ / HK$ / JP¥ stay distinct from the yuan's ¥
      f = new Intl.NumberFormat("zh-CN", { style: "currency", currency,
        minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 })
      MONEY.set(key, f)
    }
    return f.format(amount)
  } catch {
    return `${currency} ${Number(amount).toFixed(2)}`
  }
}

const NAMED = { monthly: 1, quarterly: 3, semiannual: 6, yearly: 12, biennial: 24, triennial: 36 }
const PER = { 1: "/月", 3: "/季", 6: "/半年", 12: "/年", 24: "/两年", 36: "/三年" }
function months(cycle) {
  if (cycle === "once") return 0
  return NAMED[cycle] ?? Number(/^(\d+)m$/.exec(cycle ?? "")?.[1])
}
function per(cycle) {
  const m = months(cycle)
  if (m === 0) return "一次性"
  if (!m) return ""
  return PER[m] ?? (m % 12 ? `/${m} 个月` : `/${m / 12} 年`)
}

/** Days to expiry on the hub's calendar; browser clock only for hubs without expires_in. */
function expiryDays(node) {
  if (node.expires_in !== undefined) return node.expires_in
  if (!node.expires_at) return null
  const t = new Date(`${String(node.expires_at).slice(0, 10)}T00:00:00`).getTime()
  return Number.isNaN(t) ? null : Math.ceil((t - Date.now()) / 86400000)
}
function expiryText(d) {
  if (d == null) return null
  if (d < 0) return `已过期 ${-d} 天`
  if (d === 0) return "今天到期"
  return `${d} 天后到期`
}

/** Seconds since the last report on the hub's clock; null when never seen. */
function sinceSeen(node) {
  if ("last_seen_ago" in node) return node.last_seen_ago
  if (!node.last_seen) return null
  return Math.max(0, Date.now() / 1000 - node.last_seen)
}

function monthUsed(node) {
  if (typeof node.month_used === "number") return node.month_used
  const rx = node.month_rx || 0, tx = node.month_tx || 0
  switch (node.traffic_mode) {
    case "up": return tx
    case "down": return rx
    case "max": return Math.max(rx, tx)
    default: return rx + tx
  }
}

const clock = (d = new Date()) =>
  d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })

const cc = (node) => (typeof node.country === "string" && /^[A-Za-z]{2}$/.test(node.country) ? node.country.toUpperCase() : "")

// rewritten by tools/build.mjs to the hashed directories under assets/
const FLAG_DIRS = { grey: "/flags", color: "/flags-color" }
const OS_SPRITE = "/os.svg"

// which icon in the sprite stands for an os string ("Debian GNU/Linux 12 (bookworm)")
const OS_ICONS = [
  [/ubuntu/, "ubuntu"], [/debian|raspbian/, "debian"], [/centos/, "centos"], [/alma/, "almalinux"],
  [/rocky/, "rockylinux"], [/red ?hat|rhel/, "redhat"], [/fedora/, "fedora"], [/alpine/, "alpinelinux"],
  [/manjaro/, "manjaro"], [/arch/, "archlinux"], [/suse/, "opensuse"], [/mint/, "linuxmint"], [/gentoo/, "gentoo"],
  [/nixos/, "nixos"], [/kali/, "kalilinux"], [/openwrt|immortalwrt|istoreos/, "openwrt"], [/proxmox|\bpve\b/, "proxmox"],
  [/deepin/, "deepin"], [/void/, "voidlinux"], [/android/, "android"], [/freebsd/, "freebsd"],
  [/darwin|mac ?os|os x/, "apple"], [/windows/, "windows"], [/linux|gnu/, "linux"],
]
// The space left after a row's name and flag, as its layout settles: too little
// for the icon there, and the row shows it at the end of its second line instead.
const osRoom = typeof ResizeObserver === "function"
  ? new ResizeObserver((list) => { for (const e of list) e.target.__row?.classList.toggle("os-low", e.contentRect.width < 14) })
  : null

function osIcon(os) {
  const t = String(os || "").toLowerCase()
  if (!t) return null
  // anything else a probe reports from is some Linux (Armbian, OpenCloudOS, ...)
  const id = OS_ICONS.find(([re]) => re.test(t))?.[1] || "linux"
  const svg = s("svg", { class: "os-i", viewBox: "0 0 24 24", "aria-hidden": true })
  svg.append(s("use", { href: `${OS_SPRITE}#${id}` }))
  return svg
}

/** A country as the operator chose to show it: its code, a colour flag or a grey one. */
function flag(code) {
  if (!code) return null
  const style = state.config.country_style
  const text = () => h("span", { class: "flag-txt", text: code })
  if (style !== "color" && style !== "grey") return text()
  const img = h("img", { class: `flag ${style}`, src: `${FLAG_DIRS[style]}/${code.toLowerCase()}.png`,
    alt: code, title: code, width: 16, height: 12, decoding: "async" })
  img.addEventListener("error", () => img.replaceWith(text()), { once: true })
  return img
}
/** Swap the country mark in `el` only when it changes, so pushes do not reload images. */
function setFlag(el, code) {
  const key = `${state.config.country_style}:${code}`
  if (el.dataset.cc === key) return
  el.dataset.cc = key
  clear(el)
  if (code) el.append(flag(code))
}
/** Several countries in a row: separated by dots as text, spaced as flags. */
function countryList(codes) {
  const asText = state.config.country_style !== "color" && state.config.country_style !== "grey"
  return h("span", { class: asText ? "flags as-text" : "flags" },
    codes.map((c, i) => [asText && i ? h("span", { class: "sep", text: "·" }) : null, flag(c)]))
}

/* ════════════════════════ API ════════════════════════ */

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status }
}

async function failure(res) {
  // the hub's own errors are one line of plain text meant for the reader;
  // anything else came from a proxy or CDN in front of it
  const plain = res.headers.get("content-type")?.startsWith("text/plain")
  const text = plain ? (await res.text()).trim() : ""
  return new ApiError(res.status, text ||
    (res.status >= 500 ? `服务暂时无法访问（HTTP ${res.status}），稍后再试` : `请求被拦截（HTTP ${res.status}），稍后再试`))
}

const TIMEOUT = 20_000
const RETRIES = 6
async function api(path, init) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(`/api${path}`, { ...init, signal: AbortSignal.timeout(TIMEOUT) })
      if (!res.ok) throw await failure(res)
      if (res.status === 204) return undefined
      return await res.json().catch((e) => {
        throw e instanceof SyntaxError ? new ApiError(res.status, "收到的不是状态数据，稍后再试") : e
      })
    } catch (e) {
      if (e instanceof ApiError) throw e
      const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")
      if (!timedOut || attempt === RETRIES || (init && init.method && init.method !== "GET")) {
        throw new ApiError(0, "网络连接失败，稍后再试")
      }
    }
  }
}

/* ── theme settings: theme.json defaults, then what the operator saved ── */

const FIELDS = (manifest.config || []).filter((f) => f.type !== "title")
function fits(field, value) {
  switch (field.type) {
    case "boolean": return typeof value === "boolean"
    case "number":
      return typeof value === "number" && Number.isFinite(value) &&
        value >= (field.min ?? -Infinity) && value <= (field.max ?? Infinity)
    case "select": return !!field.options?.some((o) => o.value === value)
    default: return typeof value === "string"
  }
}
async function loadConfig() {
  let saved = {}
  try {
    const res = await fetch(`/api/themes/${manifest.short}/config`)
    if (res.ok) saved = await res.json()
  } catch { /* defaults */ }
  if (!saved || typeof saved !== "object") saved = {}
  return Object.fromEntries(FIELDS.map((f) => [f.key, fits(f, saved[f.key]) ? saved[f.key] : f.default]))
}

/* ── node validation: one bad report must not blank the page ── */

const METRIC_FIELDS = ["uptime", "cpu", "mem_total", "mem_used", "swap_total", "swap_used", "disk_total",
  "disk_used", "net_rx", "net_tx", "total_rx", "total_tx", "month_rx", "month_tx", "tcp", "udp", "procs"]
const isNum = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0
function safeNodes(list) {
  if (!Array.isArray(list)) return []
  return list.filter((n) => n && typeof n === "object" && (typeof n.id === "number" || typeof n.id === "string"))
    .map((n) => {
      const m = n.metrics
      const ok = m && typeof m === "object" && METRIC_FIELDS.every((k) => isNum(m[k])) &&
        Array.isArray(m.load) && m.load.length === 3 && m.load.every(isNum)
      const name = typeof n.name === "string" && n.name ? n.name : `节点 ${n.id}`
      return { ...n, name, metrics: ok ? m : null }
    })
}

/* ── live stream: WebSocket every 2 s, gzip when possible, poll as fallback ── */

const GZIP = typeof DecompressionStream === "function" ? "?gzip" : ""
const frameText = (data) =>
  typeof data === "string" ? data : new Response(data.stream().pipeThrough(new DecompressionStream("gzip"))).text()

function startStream({ onNodes, onError, onClosed }) {
  let socket = null, poll = null, retry = null, silent = null
  let epoch = 0

  const receive = (list) => onNodes(safeNodes(list))

  const fetchOnce = () => {
    const started = epoch
    return api("/nodes").then((d) => {
      if (started === epoch) receive(d?.nodes)
    }).catch((e) => {
      if (started !== epoch) return
      if (e.status === 0 && socket?.readyState === WebSocket.OPEN) return
      onError(e.message)
      if (e.status === 401) onClosed()
    })
  }

  const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/ws${GZIP}`
  const connect = () => {
    let opened
    try { opened = new WebSocket(url) } catch { poll ??= setInterval(fetchOnce, 5000); return }
    socket = opened
    const watch = () => {
      if (silent) clearTimeout(silent)
      silent = setTimeout(() => { onError("实时数据中断，正在重新连接"); resume() }, 10_000)
    }
    watch()
    let decoded = Promise.resolve()
    opened.onmessage = (event) => {
      decoded = decoded.then(async () => {
        const text = await frameText(event.data)
        if (opened.readyState !== WebSocket.OPEN) return
        const nodes = JSON.parse(text).nodes
        watch()
        receive(nodes)
        if (poll) { clearInterval(poll); poll = null }
      }).catch((e) => console.warn("live frame dropped:", e))
    }
    opened.onerror = () => opened.close()
    opened.onclose = () => {
      if (silent) clearTimeout(silent)
      // a full hub answers the handshake with 503: keep polling, retry later
      poll ??= setInterval(fetchOnce, 5000)
      retry = setTimeout(connect, 5000)
    }
  }

  const pause = () => {
    epoch++
    if (socket) { socket.onclose = null; socket.onmessage = null; socket.close(); socket = null }
    if (poll) clearInterval(poll)
    if (retry) clearTimeout(retry)
    if (silent) clearTimeout(silent)
    poll = retry = silent = null
  }
  const resume = () => { pause(); fetchOnce(); connect() }
  document.addEventListener("visibilitychange", () => (document.hidden ? pause() : resume()))
  resume()
}

/* ════════════════════════ state & routing ════════════════════════ */

const state = {
  me: null,
  config: Object.fromEntries(FIELDS.map((f) => [f.key, f.default])),
  nodes: null,
  error: null,
  closed: false,
  // null = every node; otherwise { name } where "" is the ungrouped
  group: null,
  updatedAt: null,
  // set from the terminal's input line: sort key, search text, rows in the report
  sort: null,
  query: "",
  termLimit: null,
  // a country picked on the map
  country: null,
}

function parseRoute() {
  const m = /^\/node\/([^/]+)\/?$/.exec(location.pathname)
  return m ? { name: "node", id: decodeURIComponent(m[1]) } : { name: "home" }
}
// Coming back from a node page puts the card that was opened back where it sat
// on screen; the page above it may have changed height in the meantime.
let homeScroll = null
let homeAnchor = null
let cameFromHome = false
let pressedNode = null
if ("scrollRestoration" in history) history.scrollRestoration = "manual"
document.addEventListener("click", (e) => { pressedNode = e.target.closest?.(".card, .row") || null }, true)
document.addEventListener("keydown", (e) => { pressedNode = e.target.closest?.(".card, .row") || null }, true)

function go(path) {
  if (location.pathname + location.hash === path) return
  if (home) {
    homeScroll = window.scrollY
    homeAnchor = pressedNode?.__nodeId != null ? { id: pressedNode.__nodeId, top: pressedNode.getBoundingClientRect().top } : null
    cameFromHome = true
  } else cameFromHome = false
  const url = new URL(path, location.href)
  // same page, different anchor: just scroll
  if (url.pathname === location.pathname && home) {
    history.pushState(null, "", path)
    document.getElementById(url.hash.slice(1))?.scrollIntoView({ behavior: "smooth" })
    return
  }
  // into a node page, the name that was pressed grows into the page's title
  const from = url.pathname.startsWith("/node/") ? pressedNode?.__nameEl : null
  swap(() => {
    history.pushState(null, "", path)
    route()
    if (!path.includes("#")) window.scrollTo({ top: 0, behavior: "instant" })
  }, from)
}

/**
 * Changes page inside a view transition where the browser has them and the
 * visitor has not asked for less motion; elsewhere it just changes page.
 * `from` carries the shared name out of the old page, `into()` returns the
 * element that takes it in the new one.
 */
// True while a page is built inside a view transition. The transition is the
// entrance: parts that also faded in on their own showed up a beat after the
// rest, which read as a flicker.
let swapping = false
/** A class list, without its entrance animation when the page should arrive still. */
const entry = (cls, still = swapping) => (still ? cls.replace(/\s*\breveal(-\d)?\b/g, "").trim() : cls)
function swap(change, from, into) {
  if (!document.startViewTransition || !motionOK()) { change(); return }
  if (from) from.style.viewTransitionName = "node-title"
  let to = null
  const t = document.startViewTransition(() => {
    if (from) from.style.viewTransitionName = ""
    swapping = true
    try { change() } finally { swapping = false }
    to = into?.() || null
    if (to) to.style.viewTransitionName = "node-title"
  })
  t.finished.catch(() => {}).then(() => { if (to) to.style.viewTransitionName = "" })
}
document.addEventListener("click", (e) => {
  const a = e.target.closest?.("a[data-route]")
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
  e.preventDefault()
  go(a.getAttribute("href"))
})
function restoreHome() {
  // Rows off screen are sized by estimate until they are first drawn, which
  // moved the anchor a frame or two after landing on it -- a visible jolt where
  // the browser has no scroll anchoring (Safari). While `settle` is on, every
  // row is laid out for real, so one measurement is final.
  const list = home?.list
  const settle = list && list.children.length <= 400
  if (settle) list.classList.add("settle")
  window.scrollTo({ top: homeScroll, behavior: "instant" })
  const item = homeAnchor && (home?.cards.get(homeAnchor.id) || home?.rows.get(homeAnchor.id))
  if (item) window.scrollBy({ top: item.el.getBoundingClientRect().top - homeAnchor.top, behavior: "instant" })
  // sizes are remembered once drawn; then the rows can go back to being skipped
  if (settle) setTimeout(() => list.classList.remove("settle"), 600)
}
window.addEventListener("popstate", () => {
  const backHome = parseRoute().name === "home" && homeScroll != null && !home
  // the list is being put back as it was: its rows do not make an entrance again
  quietHome = backHome && !location.hash
  swap(() => {
    route()
    if (backHome && !location.hash) restoreHome()
  }, null, () => {
    // back on the list, the title shrinks into the name it came from
    const item = backHome && homeAnchor && (home?.cards.get(homeAnchor.id) || home?.rows.get(homeAnchor.id))
    return item?.el.__nameEl
  })
})

/* ════════════════════════ group helpers ════════════════════════ */

const groupsOf = (nodes) => [...new Set(nodes.map((n) => n.group ?? "").filter(Boolean))]
function inGroup(nodes) {
  const g = state.group
  if (!g) return nodes
  return nodes.filter((n) => (n.group ?? "") === g.name)
}
const live = (n) => (n.online ? n.metrics : null)
// larger first, except name and expiry; a node with no figure goes last
const SORTS = {
  cpu: (n) => live(n)?.cpu,
  mem: (n) => (live(n) ? ratio(live(n).mem_used, live(n).mem_total) : null),
  disk: (n) => (live(n) ? ratio(live(n).disk_used, live(n).disk_total) : null),
  speed: (n) => (live(n) ? live(n).net_rx + live(n).net_tx : null),
  traffic: (n) => monthUsed(n),
  expiry: (n) => { const d = expiryDays(n); return d == null ? null : -d },
}
const matches = (n, q) => [n.name, cc(n), n.group, n.os, n.public_remark].some((v) => v && String(v).toLowerCase().includes(q))
function arrange(nodes) {
  let list = nodes
  const q = state.query
  if (state.country) list = list.filter((n) => cc(n) === state.country)
  if (q) list = list.filter((n) => matches(n, q))
  if (state.sort === "name") return [...list].sort((a, b) => String(a.name).localeCompare(String(b.name), "zh-Hans-CN", { numeric: true }))
  const key = SORTS[state.sort]
  if (!key) return list
  const val = (n) => { const v = key(n); return typeof v === "number" && Number.isFinite(v) ? v : -Infinity }
  // stable, so equal nodes keep the operator's order
  return [...list].sort((a, b) => val(b) - val(a))
}

function summarize(nodes) {
  let online = 0, rx = 0, tx = 0, month = 0
  for (const n of nodes) {
    if (n.online) online++
    if (n.online && n.metrics) { rx += n.metrics.net_rx; tx += n.metrics.net_tx }
    month += monthUsed(n) || 0
  }
  return { total: nodes.length, online, offline: nodes.length - online, rx, tx, month }
}

/* ════════════════════════ shell: header, banner, footer ════════════════════════ */

const ICONS = {
  moon: () => s("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": 1.6, "stroke-linecap": "round", "stroke-linejoin": "round", class: "theme-moon", "aria-hidden": true },
    s("path", { d: "M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5a7 7 0 0 0 10.7 10.7Z" })),
  sun: () => s("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": 1.6, "stroke-linecap": "round", class: "theme-sun", "aria-hidden": true },
    s("circle", { cx: 12, cy: 12, r: 4 }),
    s("path", { d: "M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" })),
}

// The tab says when something is down: a count before the title, a red dot on the icon.
const ICON = document.querySelector('link[rel="icon"]')
const ICON_HREF = ICON?.getAttribute("href")
const ICON_DOWN = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0a0a0a"/><g fill="none" stroke="#fff" stroke-width="4"><path d="M22 16v32"/><path d="M29 31.5 44 16"/><path d="M33 35.5 46 48"/></g><circle cx="49" cy="15" r="13" fill="#e5484d" stroke="#fff" stroke-width="3"/></svg>')
let pageTitle = "", downCount = 0
function setTitle(text) { pageTitle = text; showTitle() }
function showTitle() {
  const t = downCount ? `(${downCount} 离线) ${pageTitle}` : pageTitle
  if (document.title !== t) document.title = t
}
function setDown(n) {
  if (n === downCount) return
  if (ICON && !n !== !downCount) ICON.setAttribute("href", n ? ICON_DOWN : ICON_HREF)
  downCount = n
  showTitle()
}

function toggleTheme(e) {
  const root = document.documentElement
  const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches
  const next = dark ? "light" : "dark"
  const apply = () => {
    root.dataset.theme = next
    // the phone's browser bar follows the visitor's choice too
    for (const m of document.querySelectorAll('meta[name="theme-color"]')) m.setAttribute("content", next === "dark" ? "#0a0a0a" : "#ffffff")
  }
  try { localStorage.setItem("kerf-theme", next) } catch { /* private mode */ }
  if (!document.startViewTransition || !motionOK()) { apply(); return }
  // The new theme opens as a circle from the button that was pressed (from the
  // corner it sits in when the command came from the terminal).
  const at = e?.currentTarget?.getBoundingClientRect?.()
  const x = at ? at.left + at.width / 2 : innerWidth - 32, y = at ? at.top + at.height / 2 : 32
  const reach = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))
  root.classList.add("theme-swap")
  const t = document.startViewTransition(apply)
  t.ready.then(() => root.animate(
    { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${reach}px at ${x}px ${y}px)`] },
    { duration: 520, easing: "cubic-bezier(.3, .1, .2, 1)", pseudoElement: "::view-transition-new(root)" })).catch(() => {})
  t.finished.catch(() => {}).then(() => root.classList.remove("theme-swap"))
}

// The header gives up some height while the page is read downwards and takes
// it back as soon as it is scrolled up. Its margin grows by what its height
// loses, so nothing below it moves.
let lastY = 0, slim = false, scrollTick = 0
addEventListener("scroll", () => {
  if (scrollTick) return
  scrollTick = requestAnimationFrame(() => {
    scrollTick = 0
    const y = scrollY, d = y - lastY
    const next = y < 48 ? false : d > 4 ? true : d < -4 ? false : slim
    if (Math.abs(d) > 4) lastY = y
    if (next === slim) return
    slim = next
    document.getElementById("top")?.classList.toggle("slim", slim)
  })
}, { passive: true })

const shell = {}
function buildShell() {
  const app = document.getElementById("app")
  clear(app)
  shell.siteName = h("span", { text: "Monitor" })
  shell.admin = h("a", { class: "btn btn-primary btn-sm", href: "/admin/", text: "登录" })
  shell.navHome = h("a", { href: "/#overview", "data-route": true, text: "概览" })
  shell.navNodes = h("a", { href: "/#nodes", "data-route": true, text: "节点" })
  shell.banner = h("div", { class: "banner", role: "status", hidden: true })
  shell.main = h("main", { id: "main" })
  shell.footText = h("span", { class: "note", hidden: true })
  shell.footYear = h("span")

  app.append(
    h("header", { class: "top", id: "top" },
      h("div", { class: "wrap" },
        h("a", { class: "brand", href: "/", "data-route": true, "aria-label": "首页" },
          h("img", { src: "/favicon.svg", alt: "", width: 28, height: 28 }), shell.siteName),
        h("nav", { class: "nav", "aria-label": "页面" }, shell.navHome, shell.navNodes),
        h("div", { class: "right" },
          shell.admin,
          h("button", { class: "icon-btn", type: "button", "aria-label": "切换深浅色", title: "切换深浅色", on: { click: toggleTheme } },
            ICONS.moon(), ICONS.sun())))),
    shell.banner,
    shell.main,
    h("footer", { class: "foot" },
      h("div", { class: "wrap foot-in" }, shell.footText, h("span", { class: "copy" }, "© ", shell.footYear))))
}

function updateShell() {
  const name = state.me?.site_name || "Monitor"
  setText(shell.siteName, name)
  setText(shell.footYear, `${new Date().getFullYear()} ${name}`)
  setText(shell.admin, state.me?.authed ? "进入后台" : "登录")
  const ft = state.config.footer_text
  shell.footText.hidden = !ft
  setText(shell.footText, ft || "")
  shell.banner.hidden = !state.error
  setText(shell.banner, state.error || "")
}

/* ════════════════════════ home ════════════════════════ */

let home = null      // refs while the home page is mounted
let quietHome = false

function renderHome() {
  clear(shell.main)
  const c = state.config
  const r = (home = { cards: new Map(), rows: new Map(), groupsKey: null, quiet: quietHome })
  const still = swapping || quietHome
  quietHome = false
  r.skel = state.nodes ? null : Array.from({ length: 6 }, () => skeleton(c.layout === "list"))

  r.title = h("h1", { class: entry("display xl reveal", still) })
  r.chip = h("div", { class: entry("chip reveal reveal-3", still) })
  r.notice = c.notice
    ? h("div", { class: entry("notice reveal", still) }, h("span", { class: "tag", text: "公告" }), h("span", { class: "txt", text: c.notice }))
    : null

  r.map = c.show_map ? buildMap(still) : null

  // terminal report
  r.termTitle = h("span")
  r.termCmdText = h("span")
  r.termCmd = h("div", { class: "cmd line" }, r.termCmdText)
  r.termHost = h("div", { class: "line" })
  r.termRows = h("div", { class: "term-rows" })
  r.termNote = h("div", { class: "comment" })
  r.termOut = h("div", { class: "term-out", role: "status", hidden: true })
  r.termIn = h("input", { type: "text", class: "term-input", "aria-label": "终端命令", placeholder: "help",
    autocomplete: "off", autocapitalize: "off", autocorrect: "off", spellcheck: "false", enterkeyhint: "go", maxlength: 60 })
  r.say = (out) => {
    r.termOut.hidden = !out
    // one line is a comment; several are a listing, printed as they are
    setText(r.termOut, !out ? "" : out.includes("\n") ? out : `# ${out}`)
  }
  r.diffBox = h("div", { class: "panel narrow diff", hidden: true })
  r.charts = []
  let recall = termHistory.length
  r.termIn.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { r.termIn.blur(); return }
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return
    e.preventDefault()
    recall = Math.max(0, Math.min(termHistory.length, recall + (e.key === "ArrowUp" ? -1 : 1)))
    r.termIn.value = termHistory[recall] ?? ""
  })
  const prompt = c.terminal_input
    ? h("form", { class: "term-in", on: { submit: (e) => {
      e.preventDefault()
      const line = r.termIn.value.trim()
      if (line && termHistory[termHistory.length - 1] !== line) termHistory.push(line)
      recall = termHistory.length
      r.termIn.value = ""
      r.say(runCommand(line, r))
      updateHome()
    } } }, h("span", { class: "ps", "aria-hidden": true, text: "$" }), r.termIn)
    : null
  const term = c.show_terminal
    ? h("div", { class: entry("wrap reveal reveal-4", still) },
      h("div", { class: "term narrow", "aria-label": "实时报告" },
        h("div", { class: "term-bar", "aria-hidden": true }, h("i"), h("i"), h("i"), r.termTitle),
        r.termCmd, r.termHost, r.termRows, prompt, r.termOut, r.termNote),
      r.diffBox)
    : null
  if (c.show_terminal) typeCommand(r)

  r.stats = {}
  const stat = (key, label) => h("div", { class: "stat" },
    h("div", { class: "val", ref: (el) => (r.stats[key] = el) }), h("div", { class: "lbl", text: label }))
  r.tabs = h("div", { class: "tabs", hidden: true })
  r.list = h("div", { class: c.layout === "list" ? "rows" : "grid" }, r.skel)
  r.empty = h("div", { class: "empty", hidden: true, text: "这里还没有节点" })
  r.sectionLede = h("p", { class: "lede" })

  append(shell.main, [
    h("section", { class: "hero", id: "overview" },
      h("div", { class: "wrap stack" },
        r.notice,
        r.title,
        c.hero_subtitle ? h("p", { class: entry("lede reveal reveal-2", still), text: c.hero_subtitle }) : null,
        r.chip)),
    r.map ? h("div", { class: entry("wrap reveal reveal-3", still) }, r.map.el) : null,
    term,
    h("section", { class: "section", id: "nodes" },
      h("div", { class: "wrap" },
        h("div", { class: "section-head" }, h("h2", { class: "h2", text: "节点" }), r.sectionLede),
        r.tabs,
        h("div", { class: "stats home", style: { marginBottom: "28px" } },
          stat("online", "在线节点"), stat("rx", "实时下行"), stat("tx", "实时上行"), stat("month", "本期流量")),
        r.list, r.empty))])

  updateHome()
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView()
}

function updateHome() {
  const r = home
  if (!r) return
  const c = state.config
  const all = state.nodes ?? []
  const site = state.me?.site_name || "Monitor"
  setText(r.title, c.hero_title || site)

  // group tabs — rebuilt only when the set of groups changes
  const groups = groupsOf(all)
  const hasUngrouped = groups.length > 0 && all.some((n) => !(n.group ?? ""))
  if (state.group && !(state.group.name === "" ? hasUngrouped : groups.includes(state.group.name))) state.group = null
  const key = JSON.stringify([groups, hasUngrouped])
  if (key !== r.groupsKey) {
    r.groupsKey = key
    clear(r.tabs)
    r.tabs.hidden = groups.length === 0
    r.tabCount = new Map()
    if (groups.length) {
      const tab = (label, sel) => {
        const count = h("span", { class: "count" })
        r.tabCount.set(sel === null ? null : sel.name, count)
        const pressed = sel === null ? state.group === null : state.group?.name === sel.name
        return h("button", { class: "tab", type: "button", "aria-pressed": pressed ? "true" : "false", "data-sel": sel === null ? "\u0000all" : sel.name,
          on: { click: () => { state.group = sel; r.regroup = true; updateHome() } } }, h("span", { text: label }), count)
      }
      r.pill = h("i", { class: "tab-pill", "aria-hidden": true })
      const strip = h("div", { class: "tabs-in", role: "group", "aria-label": "分组" }, r.pill,
        tab("全部", null),
        groups.map((g) => tab(g, { name: g })),
        hasUngrouped ? tab("未分组", { name: "" }) : null)
      r.tabs.append(strip)
      r.strip = strip
      const edges = () => {
        const max = strip.scrollWidth - strip.clientWidth
        strip.classList.toggle("fade-l", strip.scrollLeft > 2)
        strip.classList.toggle("fade-r", strip.scrollLeft < max - 2)
      }
      strip.addEventListener("scroll", edges, { passive: true })
      requestAnimationFrame(() => {
        const on = strip.querySelector('[aria-pressed="true"]')
        if (on && strip.scrollWidth > strip.clientWidth) strip.scrollLeft = on.offsetLeft - (strip.clientWidth - on.offsetWidth) / 2
        edges()
      })
    }
  }
  if (r.strip) {
    const want = state.group === null ? "\u0000all" : state.group.name
    let on = null
    for (const b of r.strip.querySelectorAll(".tab")) {
      const pressed = b.dataset.sel === want
      b.setAttribute("aria-pressed", pressed ? "true" : "false")
      if (pressed) on = b
    }
    if (on) requestAnimationFrame(() => {
      r.pill.style.width = `${on.offsetWidth}px`
      r.pill.style.transform = `translateX(${on.offsetLeft - 4}px)`
      if (r.regroupScroll !== want && r.strip.scrollWidth > r.strip.clientWidth) {
        r.strip.scrollTo({ left: on.offsetLeft - (r.strip.clientWidth - on.offsetWidth) / 2, behavior: r.regroupScroll ? "smooth" : "instant" })
      }
      r.regroupScroll = want
    })
  }
  if (r.tabCount) {
    for (const [name, el] of r.tabCount) {
      const n = name === null ? all.length : all.filter((x) => (x.group ?? "") === name).length
      setText(el, String(n))
    }
  }

  const nodes = inGroup(all)
  const sum = summarize(nodes)

  // hero chip: "12 在线 · 2 离线 — [flags]"; rebuilt only when it changes
  const countries = [...new Set(nodes.map(cc).filter(Boolean))]
  const room = innerWidth < 640 ? 5 : 8
  const chipKey = state.nodes ? JSON.stringify([sum.online, sum.offline, countries.slice(0, room), countries.length, state.config.country_style]) : "wait"
  if (chipKey !== r.chipKey) {
    r.chipKey = chipKey
    clear(r.chip)
    if (state.nodes) {
      append(r.chip, [
        h("b", { text: `${sum.online} 在线` }),
        sum.offline ? [h("span", { class: "sep", text: "·" }), h("b", { text: `${sum.offline} 离线` })] : null,
        countries.length ? [h("span", { class: "sep", text: "—" }),
          countryList(countries.slice(0, room)),
          countries.length > room ? h("span", { class: "more", text: `+${countries.length - room}` }) : null] : null])
    } else {
      r.chip.append(h("span", { text: "正在连接…" }))
    }
  }

  // section copy
  const found = state.query || state.country ? arrange(nodes).length : null
  setText(r.sectionLede, !state.nodes ? "正在连接…" : found != null ? `${[state.country, state.query && `grep ${state.query}`].filter(Boolean).join(" · ")} · ${found} / ${sum.total} 个节点`
    : state.group ? `${state.group.name || "未分组"} · ${sum.total} 个节点`
    : `${sum.total} 个节点${groups.length ? ` · ${groups.length} 个分组` : ""}`)

  // stats strip
  // before the first answer there is nothing to count: a dash, not a zero
  const ready = !!state.nodes
  setText(r.stats.online, ready ? `${sum.online}/${sum.total}` : "—")
  setText(r.stats.rx, ready ? rate(sum.rx) : "—")
  setText(r.stats.tx, ready ? rate(sum.tx) : "—")
  setText(r.stats.month, ready ? bytes(sum.month) : "—")

  r.map?.update(nodes)
  const shown = arrange(nodes)

  // terminal report
  if (c.show_terminal) updateTerminal(r, shown, sum, site)

  // node list (keyed, updated in place)
  const list = c.layout === "list" ? r.rows : r.cards
  const make = c.layout === "list" ? makeRow : makeCard
  const seen = new Set()
  const regroup = r.regroup
  r.regroup = false
  if (state.nodes && r.skel) { for (const el of r.skel) el.remove(); r.skel = null }
  let fresh = 0
  shown.forEach((n, i) => {
    seen.add(n.id)
    let item = list.get(n.id)
    if (!item) {
      item = make(n)
      list.set(n.id, item)
      if (!r.quiet) enter(item.el, fresh++)
      item.update(n)
      // an item scrolled into view catches up with the newest data
      item.el.__show = () => { if (item.pending) { const p = item.pending; item.pending = null; item.update(p) } }
    } else {
      if (regroup) enter(item.el, i)
      // off screen, the newest data waits: with hundreds of nodes, updating
      // only what can be seen is most of the work saved
      if (!seenObserver || onScreen.has(n.id)) { item.pending = null; item.update(n) } else item.pending = n
    }
    place(r.list, item.el, i)       // the operator's order, without moving what is in place
  })
  for (const [id, item] of list) if (!seen.has(id)) { item.destroy?.(); item.el.remove(); list.delete(id) }
  if (state.nodes) r.quiet = false
  r.empty.hidden = !state.nodes || shown.length > 0
  setText(r.empty, (state.query || state.country) && nodes.length ? `没有匹配「${[state.country, state.query].filter(Boolean).join(" ")}」的节点，在终端输入 clear 还原` : "这里还没有节点")
}

/** A placeholder with the outline of a row or a card, shown while the nodes load. */
function skeleton(row) {
  const bar = (cls) => h("b", { class: `sk ${cls}` })
  return row
    ? h("div", { class: "row skel", "aria-hidden": true },
      h("div", { class: "who" }, bar("w-name"), bar("w-sub")), h("div", { class: "os" }), bar("w-lanes"), bar("w-net"), h("span", { class: "go" }))
    : h("div", { class: "card skel", "aria-hidden": true }, bar("w-name"), bar("w-price"), bar("w-btn"), bar("w-line"), bar("w-line"), bar("w-line"))
}

/* ── the terminal's input line ── */

const SORT_NAMES = ["cpu", "mem", "disk", "speed", "traffic", "expiry", "name"]
const termHistory = []
// "/" puts the cursor in the terminal, as it does in a pager or a search box
document.addEventListener("keydown", (e) => {
  if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || !home?.termIn?.isConnected) return
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName) || e.target?.isContentEditable) return
  e.preventDefault()
  home.termIn.focus({ preventScroll: true })
  home.termIn.scrollIntoView({ block: "center", behavior: motionOK() ? "smooth" : "auto" })
})

const HELP = [
  ["sort cpu|mem|disk|speed|traffic|expiry|name", "排序"],
  ["grep 关键字", "筛选节点"],
  ["top 行数", "报告的行数"],
  ["ping 关键字", "看这些节点的延迟"],
  ["diff 节点A 节点B", "对比两台的延迟"],
  ["neofetch · theme · clear", ""],
].map(([c, d]) => (d ? `${c}  — ${d}` : c)).join("\n")

// plain ASCII: block characters fall back to a wider font on some phones and
// push the columns out of line
const LOGO = ["|   /", "|  / ", "| /  ", "| \\  ", "|  \\ ", "|   \\"]
function neofetch() {
  const all = state.nodes ?? []
  const sum = summarize(all)
  const info = [
    `${state.me?.authed ? "admin" : "guest"}@${location.host}`,
    `theme   ${manifest.name} ${manifest.version}`,
    `nodes   ${sum.total} (${sum.online} online)`,
    `regions ${new Set(all.map(cc).filter(Boolean)).size}`,
    `speed   ↓ ${rate(sum.rx)}  ↑ ${rate(sum.tx)}`,
    `month   ${bytes(sum.month)}`,
  ]
  return info.map((t, i) => `${LOGO[i]}   ${t}`).join("\n")
}

/** Latency of the nodes matching `q`, from what the list has already fetched. */
function pingReport(q) {
  const found = (state.nodes ?? []).filter((n) => matches(n, q))
  if (!found.length) return `ping: 没有匹配 ${q} 的节点`
  let waiting = false
  const lines = found.slice(0, 8).map((n) => {
    const rows = pingCache.get(n.id)?.rows
    if (!rows) { if (n.online) { waiting = true; wantPing(n.id) } return `${n.name}  ${n.online ? "…" : "offline"}` }
    if (!rows.length) return `${n.name}  没有延迟监控`
    return `${n.name}  ${rows.slice(0, 4).map((x) => `${probeShort(x.name)} ${x.last == null ? "超时" : `${Math.round(x.last)}ms`}`).join("  ")}`
  })
  if (found.length > 8) lines.push(`… 还有 ${found.length - 8} 个`)
  if (waiting) lines.push("# … 的正在获取，再输入一次就有了")
  return lines.length === 1 ? lines[0] : lines.join("\n")
}

/** Two nodes' latency on one chart, each as the mean of its lines. */
function diffNodes(arg, r) {
  const names = arg.split(/\s+(?:vs\.?\s+)?/i).filter(Boolean)
  if (names.length !== 2) return "diff: 需要两个节点名，例如 diff tokyo aws"
  const pick = names.map((q) => (state.nodes ?? []).find((n) => String(n.name).toLowerCase() === q.toLowerCase()) || (state.nodes ?? []).find((n) => matches(n, q.toLowerCase())))
  if (!pick[0] || !pick[1]) return `diff: 找不到 ${names[pick[0] ? 1 : 0]}`
  if (pick[0].id === pick[1].id) return "diff: 这是同一个节点"
  const hours = 6
  Promise.all(pick.map((n) => api(`/nodes/${encodeURIComponent(n.id)}/metrics?hours=${hours}&points=360&series=ping`)))
    .then((res) => {
      if (home !== r) return
      const series = res.map((d, i) => {
        // per timestamp, the mean of the lines that answered
        const at = new Map()
        for (const p of Array.isArray(d?.ping) ? d.ping : []) {
          if (!p || !isNum(p.ts) || typeof p.latency !== "number") continue
          const c = at.get(p.ts) || [0, 0]
          c[0] += p.latency; c[1]++
          at.set(p.ts, c)
        }
        const pts = [...at].sort((a, b) => a[0] - b[0]).map(([ts, [sum, n]]) => [ts * 1000, sum / n])
        return { name: pick[i].name, color: i ? "var(--term-red)" : "var(--accent)", pts,
          gap: medianStep(pts.map((p) => p[0] / 1000)) * 3 * 1000, avg: avg(pts.map((p) => p[1])) }
      })
      if (series.some((x) => !x.pts.length)) { r.say(`diff: ${series.find((x) => !x.pts.length).name} 没有延迟数据`); return }
      const c = chart({ label: "平均延迟", current: "", fmt: (v) => `${Math.round(v)} ms`, tipFmt: (v) => `${Math.round(v)} ms`, series })
      r.charts = [c]
      r.diffBox.replaceChildren(
        h("div", { class: "panel-head" },
          h("span", { class: "panel-title", text: "延迟对比" }),
          h("button", { type: "button", class: "diff-close", "aria-label": "关闭对比", text: "×", on: { click: () => closeDiff(r) } })),
        c.el,
        h("div", { class: "legend" }, series.map((x) => h("span", null, h("i", { style: { background: x.color } }), x.name, h("em", { text: `${Math.round(x.avg)} ms` })))),
        h("p", { class: "diff-note", text: `最近 ${hours} 小时，每台取各线路的平均值` }))
      r.diffBox.hidden = false
      const d = series[0].avg - series[1].avg
      r.say(Math.abs(d) < 1 ? "两台差不多" : `${series[d < 0 ? 0 : 1].name} 平均快 ${Math.round(Math.abs(d))} ms`)
    })
    .catch((e) => { if (home === r) r.say(`diff: ${e.message}`) })
  return "正在对比…"
}
function closeDiff(r) { r.diffBox.hidden = true; r.diffBox.replaceChildren(); r.charts = [] }

/** Runs one line typed into the terminal; returns what it prints, if anything. */
function runCommand(line, r) {
  const [cmd = "", ...rest] = line.trim().split(/\s+/)
  const arg = rest.join(" ")
  switch (cmd.toLowerCase()) {
    case "": return ""
    case "help": case "?": case "man": return HELP
    case "neofetch": case "fastfetch": case "uname": return neofetch()
    case "ping": return arg ? pingReport(arg.toLowerCase()) : "ping: 后面跟节点名、国家或分组，例如 ping jp"
    case "diff": case "vs": return diffNodes(arg, r)
    case "sort": {
      const k = arg.toLowerCase().replace(/^--?/, "")
      if (!k || k === "default" || k === "none") { state.sort = null; return "已恢复默认顺序" }
      if (!SORT_NAMES.includes(k)) return `sort: 不认识 ${arg}，可用 ${SORT_NAMES.join(" ")}`
      state.sort = k
      return `节点已按 ${k} 排序`
    }
    case "grep": case "find": case "search":
      state.query = arg.toLowerCase().replace(/^["']|["']$/g, "")
      return state.query ? `只显示包含 ${state.query} 的节点` : "已取消筛选"
    case "top": case "head": {
      const n = Number(arg.replace(/^-n?\s*/, ""))
      if (!Number.isInteger(n) || n < 1 || n > 20) return "top: 行数在 1 到 20 之间"
      state.termLimit = n
      return ""
    }
    case "theme": toggleTheme(); return ""
    case "clear": case "reset": case "ls":
      state.sort = null; state.query = ""; state.termLimit = null; state.country = null
      closeDiff(r)
      return ""
    case "whoami": return state.me?.authed ? "admin" : "guest"
    case "date": return new Date().toLocaleString()
    case "sudo": return "guest is not in the sudoers file. This incident will be reported."
    case "exit": case "quit": return "这里没有出口，试试 help"
    default: return `command not found: ${cmd}，试试 help`
  }
}

const termCommand = () => {
  const limit = state.termLimit ?? (Math.round(state.config.terminal_rows) || 5)
  return `monitor top --sort ${state.sort || "speed"} --limit ${limit}${state.country ? ` --country ${state.country}` : ""}${state.query ? ` | grep ${state.query}` : ""}`
}

// The command is typed out once per visit, the first time the terminal shows.
let typedOnce = false
function typeCommand(r) {
  if (typedOnce || !motionOK()) { typedOnce = true; return }
  typedOnce = true
  const text = termCommand()
  const caret = h("i", { class: "caret", "aria-hidden": true })
  r.typing = true
  r.termCmdText.textContent = ""
  r.termCmd.append(caret)
  r.termCmd.setAttribute("aria-label", text)
  let i = 0
  const step = () => {
    if (home !== r) return
    r.termCmdText.textContent = text.slice(0, ++i)
    if (i < text.length) setTimeout(step, 22 + Math.random() * 38)
    else setTimeout(() => { r.typing = false; caret.remove(); r.termCmd.removeAttribute("aria-label") }, 900)
  }
  setTimeout(step, 520)
}

/* ── dot-matrix world map: land as one dotted path, a marker per country ── */

const MAP_AT = (() => {
  const at = new Map()
  for (const item of MAP.places.split(";")) {
    const [x, y] = item.slice(2).split(",").map(Number)
    at.set(item.slice(0, 2), [x, y])
  }
  return at
})()
function buildMap(still) {
  const { cols, rows, land } = MAP
  // every land cell is a zero-length stroke with round caps: one element, 900 dots
  let d = ""
  for (let i = 0; i < cols * rows; i++) {
    if ((parseInt(land[i >> 2], 16) >> (3 - (i & 3))) & 1) d += `M${(i % cols) + 0.5} ${Math.floor(i / cols) + 0.5}h0`
  }
  const marks = s("g")
  const svgEl = s("svg", { class: "map", viewBox: `0 0 ${cols} ${rows}`, role: "img" },
    s("path", { class: "land", d }), marks)
  let key = ""
  return {
    el: svgEl,
    update(nodes) {
      const by = new Map()
      for (const n of nodes) {
        const code = cc(n)
        if (!MAP_AT.has(code)) continue
        const c = by.get(code) || { on: 0, all: 0 }
        c.all++
        if (n.online) c.on++
        by.set(code, c)
      }
      if (state.country && !by.has(state.country)) state.country = null
      const next = JSON.stringify([[...by], state.country])
      if (next === key) return
      const first = key === "" && !still
      key = next
      clear(marks)
      svgEl.setAttribute("aria-label", by.size ? `节点分布在 ${by.size} 个国家和地区` : "世界地图")
      let i = 0
      for (const [code, c] of by) {
        const [x, y] = MAP_AT.get(code)
        // on the grid, like the land around it
        const cx = Math.min(cols - 0.5, Math.floor(x) + 0.5), cy = Math.min(rows - 0.5, Math.max(0.5, Math.floor(y) + 0.5))
        const picked = state.country === code
        const pick = () => { state.country = picked ? null : code; updateHome() }
        const g = s("g", { class: `mark ${c.on ? "on" : "off"}${first ? " pop" : ""}${picked ? " sel" : ""}${state.country && !picked ? " dim" : ""}`,
          style: first ? `animation-delay:${400 + i++ * 70}ms` : null, role: "button", tabindex: 0, "aria-pressed": String(picked),
          on: { click: pick, keydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick() } } } },
          s("circle", { class: "hit", cx, cy, r: 2.4 }),
          s("circle", { class: "glow", cx, cy, r: picked ? 2.1 : 1.5 }), s("circle", { class: "pin", cx, cy, r: picked ? 0.8 : 0.62 }))
        g.append(s("title", null, `${code} · ${c.on} 在线${c.all > c.on ? ` · ${c.all - c.on} 离线` : ""} · 点击${picked ? "取消" : "只看这里"}`))
        marks.append(g)
      }
    },
  }
}

function updateTerminal(r, nodes, sum, site) {
  const limit = state.termLimit ?? (Math.round(state.config.terminal_rows) || 5)
  setText(r.termTitle, `monitor — ${site}`)
  if (!r.typing) setText(r.termCmdText, termCommand())
  setText(r.termHost, `HOST: ${location.host}  (${state.nodes ? `${sum.online} online · ${sum.total} nodes` : "connecting…"})`)
  const load = (n) => (n.online && n.metrics ? n.metrics.net_rx + n.metrics.net_tx : -1)
  // `nodes` arrives searched, and sorted when a sort was asked for
  const top = (state.sort ? nodes : [...nodes].sort((a, b) => load(b) - load(a))).slice(0, limit)
  if (!r.termCells || r.termCells.length !== top.length) {
    clear(r.termRows)
    r.termCells = top.map((_, i) => {
      const cell = (cls, label) => {
        const v = h("span")
        const el = h("span", { class: cls }, label ? h("span", { class: "lo", text: label }) : null, v)
        return { el, v }
      }
      const row = { name: h("span"), code: h("small"), cpu: cell("v", "cpu "), mem: cell("v wide", "mem "), rx: cell("v", "↓"), tx: cell("v wide", "↑") }
      r.termRows.append(h("span", { class: "n", text: `${i + 1}.` }), h("span", { class: "nm" }, row.name, row.code),
        row.cpu.el, row.mem.el, row.rx.el, row.tx.el)
      return row
    })
  }
  top.forEach((n, i) => {
    const m = n.online ? n.metrics : null
    const row = r.termCells[i]
    setText(row.name, n.name)
    setText(row.code, cc(n))
    row.code.hidden = !cc(n)
    row.cpu.el.classList.toggle("off", !m)
    row.cpu.el.firstChild.hidden = !m
    setText(row.cpu.v, m ? pct(m.cpu) : n.online ? "waiting" : "offline")
    for (const [c, t] of [[row.mem, m ? pct(ratio(m.mem_used, m.mem_total), 0) : ""], [row.rx, m ? rateShort(m.net_rx) : ""], [row.tx, m ? rateShort(m.net_tx) : ""]]) {
      c.el.firstChild.hidden = !m
      setText(c.v, t)
    }
  })
  setText(r.termNote, `# live · ${state.updatedAt ? clock(state.updatedAt) : "--:--:--"} · every 2s`)
}

/* ── one node as a pricing-style card ── */

function meterRow(label) {
  const bar = h("i")
  const v = h("span", { class: "v" })
  return { el: h("div", { class: "meter" }, h("span", { class: "k", text: label }), h("div", { class: "bar" }, bar), v), bar, v }
}
function setMeter(m, p, text) {
  const w = p == null ? 0 : Math.max(0, Math.min(100, p))
  m.bar.style.width = `${w}%`
  m.bar.classList.toggle("hot", w >= 90)
  setText(m.v, text ?? (p == null ? "—" : pct(p, 0)))
}

/* ── latency: the last hour of each probe, fetched only for nodes on screen,
   three requests at a time ── */

// The hub holds probe results in memory and files a minute's worth when the
// first frame of the next minute arrives, a second or two past the boundary;
// the history API serves only filed minutes. So a reading is stale once the
// clock passes :03 of a new minute, and fetching then gets the minute just
// filed. Should that minute still be missing, one retry follows 6 s later.
const PING_PHASE = 3_000
const minuteMark = (t) => Math.floor((t - PING_PHASE) / 60_000)
const pingStale = (c, now) => !c || minuteMark(now) > minuteMark(c.at) || (c.retryAt && now >= c.retryAt)
const pingCache = new Map()        // node id → { at, rows | null }
const pingWatch = new Map()        // node id → re-render callback
const pingQueue = []
let pingActive = 0
const onScreen = new Set()

function summarizePing(d) {
  const ping = Array.isArray(d?.ping) ? d.ping.filter((p) => p && isNum(p.ts)) : []
  if (!ping.length) return []
  const probes = d.probes && typeof d.probes === "object" ? d.probes : {}
  const loss = d.loss && typeof d.loss === "object" ? d.loss : null
  // in the order the operator arranged the probes
  return [...new Set(ping.map((p) => p.task_id))].map((id) => {
    const vals = ping.filter((p) => p.task_id === id).map((p) => (typeof p.latency === "number" ? p.latency : null))
    let last = null
    for (let i = vals.length - 1; i >= 0; i--) if (vals[i] != null) { last = vals[i]; break }
    return { id, name: String(probes[id] ?? `探测 ${id}`), vals, last, loss: loss ? Number(loss[id]) || 0 : null }
  })
}

function wantPing(id) {
  const c = pingCache.get(id)
  if (!pingStale(c, Date.now())) return
  if (pingQueue.includes(id) || c?.loading) return
  pingQueue.push(id)
  pumpPing()
}
function pumpPing() {
  while (pingActive < 3 && pingQueue.length) {
    const id = pingQueue.shift()
    if (!onScreen.has(id) || document.hidden) continue
    pingActive++
    const prev = pingCache.get(id)
    pingCache.set(id, { ...(prev || {}), loading: true, at: prev?.at ?? 0 })
    api(`/nodes/${encodeURIComponent(id)}/metrics?hours=1&points=60&series=ping`)
      .then((d) => {
        const now = Date.now()
        // newest minute in the answer against the minute that should be filed by now
        let newest = 0
        for (const p of Array.isArray(d?.ping) ? d.ping : []) if (isNum(p?.ts) && p.ts > newest) newest = p.ts
        const due = (Math.floor(now / 60_000) - 1) * 60
        const retried = prev?.retried === minuteMark(now)
        const retryAt = newest && newest < due && !retried ? now + 6_000 : 0
        pingCache.set(id, { at: now, rows: summarizePing(d), retryAt, retried: retryAt ? minuteMark(now) : prev?.retried })
      })
      // keep what was shown; the next minute tries again
      .catch(() => pingCache.set(id, { at: Date.now(), rows: prev?.rows ?? null }))
      .finally(() => { pingActive--; pingWatch.get(id)?.(); pumpPing() })
  }
}

const seenObserver = typeof IntersectionObserver === "function"
  ? new IntersectionObserver((entries) => {
    for (const e of entries) {
      const id = e.target.__nodeId
      if (e.isIntersecting) { onScreen.add(id); e.target.__show?.(); if (e.target.__wantsPing?.()) wantPing(id) }
      else onScreen.delete(id)
    }
  }, { rootMargin: "200px 0px" })
  : null

/**
 * A latency trend drawn small: averaged into at most 28 points, lightly
 * smoothed, a soft fade beneath, a dot on the latest reading. Each line is
 * scaled to its own range, never narrower than 10 ms, so a steady link stays
 * flat instead of being magnified into noise. Timeouts mark the baseline red.
 */
let sparkSeq = 0
function sparkline(vals, { w = 64, h = 18, motion = null } = {}) {
  const animated = motion && !calm.matches
  const svg = s("svg", { class: `spark${animated ? ` ${motion}` : ""}`, viewBox: `0 0 ${w} ${h}`, preserveAspectRatio: "none", "aria-hidden": true })
  // bucket
  const N = Math.min(28, vals.length)
  if (N < 2) return svg
  const bucket = []
  for (let i = 0; i < N; i++) {
    const part = vals.slice(Math.floor((i * vals.length) / N), Math.floor(((i + 1) * vals.length) / N))
    const nums = part.filter((v) => v != null)
    bucket.push(nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null)
  }
  // light smoothing, gaps kept
  const sm = bucket.map((v, i) => {
    if (v == null) return null
    const near = [bucket[i - 1], v, v, bucket[i + 1]].filter((x) => x != null)
    return near.reduce((a, b) => a + b, 0) / near.length
  })
  const nums = sm.filter((v) => v != null)
  if (nums.length < 2) return svg
  let lo = Math.min(...nums), hi = Math.max(...nums)
  if (hi - lo < 10) { const mid = (hi + lo) / 2; lo = mid - 5; hi = mid + 5 }
  const pad = 2
  const X = (i) => (i / (N - 1)) * w
  const Y = (v) => h - pad - ((v - lo) / (hi - lo)) * (h - pad * 2)
  const clampY = (y) => Math.max(0.5, Math.min(h - 0.5, y))

  // runs of points between gaps, each drawn as a Catmull-Rom curve
  const runs = []
  let run = []
  sm.forEach((v, i) => {
    if (v == null) { if (run.length) runs.push(run); run = []; return }
    run.push([X(i), Y(v)])
  })
  if (run.length) runs.push(run)
  const curve = (p) => {
    let d = `M${p[0][0].toFixed(2)},${p[0][1].toFixed(2)}`
    for (let i = 0; i < p.length - 1; i++) {
      const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, clampY(p1[1] + (p2[1] - p0[1]) / 6)]
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, clampY(p2[1] - (p3[1] - p1[1]) / 6)]
      d += `C${c1[0].toFixed(2)},${c1[1].toFixed(2)} ${c2[0].toFixed(2)},${c2[1].toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`
    }
    return d
  }
  const id = `kf${++sparkSeq}`
  svg.append(s("defs", null, s("linearGradient", { id, x1: 0, y1: 0, x2: 0, y2: 1 },
    s("stop", { offset: "0", "stop-color": "currentColor", "stop-opacity": ".14" }),
    s("stop", { offset: "1", "stop-color": "currentColor", "stop-opacity": "0" }))))
  for (const p of runs) {
    if (p.length < 2) continue
    const line = curve(p)
    svg.append(s("path", { class: "fill", d: `${line}L${p[p.length - 1][0].toFixed(2)},${h}L${p[0][0].toFixed(2)},${h}Z`, fill: `url(#${id})` }))
    svg.append(s("path", { class: "line", d: line }))
  }
  bucket.forEach((v, i) => {
    if (v == null) svg.append(s("path", { class: "miss", d: `M${X(i).toFixed(2)},${h - 3}V${h}` }))
  })
  const last = sm[N - 1]
  if (animated) setTimeout(() => svg.classList.remove(motion), 1800)
  // The ring around the latest reading is an HTML element over the line, scaled
  // and faded: the compositor animates that without repainting the chart.
  // (`h` is the height here, so the elements are made by hand)
  const wrap = document.createElement("span")
  wrap.className = "spark-w"
  wrap.append(svg)
  if (last != null) {
    svg.append(s("path", { class: "dot", d: `M${X(N - 1).toFixed(2)},${Y(last).toFixed(2)}l0,0` }))
    const ring = document.createElement("i")
    ring.className = "halo"
    ring.style.top = `${((Y(last) / h) * 100).toFixed(1)}%`
    wrap.append(ring)
  }
  return wrap
}

/** The spec checklist under a card, shown when the operator turns it on. */
function feats(n) {
  const out = []
  const m = n.online ? n.metrics : null
  const memTotal = n.mem_total || m?.mem_total
  const diskTotal = n.disk_total || m?.disk_total
  if (n.cpu_cores > 0) out.push([`${n.cpu_cores} vCPU`, n.cpu_name ? ` (${cpuName(n.cpu_name)})` : ""])
  if (memTotal > 0) out.push([`${size(memTotal)} 内存`, diskTotal > 0 ? ` · ${size(diskTotal)} 磁盘` : ""])
  if (m) out.push([`↓ ${rate(m.net_rx)}`, `  ↑ ${rate(m.net_tx)}`])
  const used = monthUsed(n)
  if (n.traffic_limit > 0) out.push([`本期 ${bytes(used)}`, ` / ${size(n.traffic_limit)}`])
  else if (used > 0) out.push([`本期 ${bytes(used)}`, " / ∞"])
  const os = [osName(n.os), n.arch, n.virt].filter(Boolean)
  if (os.length) out.push([os[0], os.length > 1 ? ` · ${os.slice(1).join(" · ")}` : ""])
  if (m) out.push([`运行 ${uptime(m.uptime)}`, ` · 负载 ${m.load.map((x) => x.toFixed(2)).join(" ")}`])
  const t = expiryText(expiryDays(n))
  if (t) out.push([t, ""])
  return out
}

function makeCard(node) {
  const ref = {}
  ref.dot = h("i", { class: "dot" })
  ref.name = h("span", { class: "node-name" })
  ref.desc = h("p", { class: "card-desc" })
  ref.cc = h("span", { class: "card-cc" })
  ref.num = h("span", { class: "num" })
  ref.unit = h("span", { class: "unit" })
  ref.note = h("div", { class: "card-note", hidden: true })
  ref.cpu = meterRow("CPU")
  ref.mem = meterRow("内存")
  ref.disk = meterRow("磁盘")
  ref.traffic = meterRow("流量")
  ref.meters = h("div", { class: "meters" }, ref.cpu.el, ref.mem.el, ref.disk.el, ref.traffic.el)
  ref.lat = h("div", { class: "lat", hidden: true })
  ref.feats = h("ul", { class: "feats", hidden: true })
  ref.link = h("a", { class: "btn btn-primary btn-block", href: `/node/${encodeURIComponent(node.id)}`, "data-route": true, text: "查看详情" })
  const el = h("article", { class: "card", tabindex: 0, role: "link", "aria-label": node.name },
    h("div", { class: "card-head" },
      h("div", { class: "t" }, h("div", { class: "card-name" }, ref.dot, ref.name), ref.desc),
      ref.cc),
    h("div", { class: "price" }, h("div", { class: "big", ref: (x) => (ref.big = x) }, ref.num, ref.unit), ref.note),
    ref.link, ref.meters, ref.lat, ref.feats)
  el.addEventListener("click", (e) => {
    if (e.target.closest("a") || getSelection()?.toString()) return
    go(`/node/${encodeURIComponent(node.id)}`)
  })
  el.addEventListener("keydown", (e) => {
    if (e.target === el && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); go(`/node/${encodeURIComponent(node.id)}`) }
  })

  let cur = node
  const wants = () => state.config.show_latency && cur.online
  el.__nodeId = node.id
  el.__nameEl = ref.name
  el.__wantsPing = wants
  seenObserver?.observe(el)
  if (!seenObserver) onScreen.add(node.id)

  let latKey = ""
  let featsKey = ""
  const drawLat = () => {
    const rows = wants() ? pingCache.get(cur.id)?.rows : null
    const key = rows ? JSON.stringify(rows.map((r) => [r.name, r.last, r.loss, r.vals.length, r.vals[r.vals.length - 1]])) : "none"
    if (key === latKey) return
    const drawn = latKey !== "" && latKey !== "none"
    latKey = key
    ref.lat.hidden = !rows || rows.length === 0
    clear(ref.lat)
    if (!rows) return
    const MAX = 3
    for (const r of rows.slice(0, MAX)) {
      const lossCls = r.loss == null ? "loss" : r.loss >= 5 ? "loss bad" : r.loss >= 1 ? "loss warn" : "loss"
      ref.lat.append(h("div", { class: "lat-row" },
        h("span", { class: "nm", text: r.name }),
        sparkline(r.vals, { w: 160, h: 18, motion: drawn ? "shift" : "draw" }),
        h("span", { class: "ms", text: r.last == null ? "超时" : `${Math.round(r.last)} ms` }),
        h("span", { class: lossCls, title: "最近 1 小时丢包率",
          text: r.loss == null ? "" : r.loss === 0 ? "0%" : r.loss < 1 ? "<1%" : `${Math.round(r.loss)}%` })))
    }
    if (rows.length > MAX) ref.lat.append(h("div", { class: "lat-more", text: `另有 ${rows.length - MAX} 条线路，在详情里查看` }))
  }
  pingWatch.set(node.id, drawLat)

  return {
    el,
    destroy() { seenObserver?.unobserve(el); onScreen.delete(node.id); pingWatch.delete(node.id) },
    update(n) {
      cur = n
      const c = state.config
      const m = n.online ? n.metrics : null
      ref.dot.className = `dot ${n.online ? (m ? "on" : "wait") : "off"}`
      setText(ref.name, n.name)
      el.setAttribute("aria-label", n.name)
      const desc = n.public_remark || ""
      ref.desc.hidden = !desc
      setText(ref.desc, desc)
      setFlag(ref.cc, cc(n))
      el.classList.toggle("is-off", !n.online)

      // the big figure is the price; without one the meters below say it all
      const priced = c.show_price && n.price > 0
      ref.big.hidden = !priced
      if (priced) {
        setText(ref.num, money(n.price, n.currency || "CNY"))
        setText(ref.unit, per(n.billing_cycle))
      }

      // one short status line under the price: offline time, a near or past expiry
      clear(ref.note)
      const notes = []
      if (!n.online) {
        const ago = sinceSeen(n)
        notes.push(["bad", ago == null ? "从未上报" : `离线 ${uptime(ago)}`])
      } else if (!m) notes.push(["warn", "已连接，等待首次上报"])
      const d = c.show_expiry ? expiryDays(n) : null
      if (d != null && d <= 7) notes.push([d < 0 ? "bad" : "warn", expiryText(d)])
      notes.forEach(([cls, t], i) => append(ref.note, [i ? h("span", { class: "sep", text: " · " }) : null, h("span", { class: cls, text: t })]))
      ref.note.hidden = notes.length === 0
      ref.big.parentElement.hidden = !priced && notes.length === 0

      for (const r of [ref.cpu, ref.mem, ref.disk]) r.el.hidden = !m
      if (m) {
        setMeter(ref.cpu, m.cpu)
        setMeter(ref.mem, ratio(m.mem_used, m.mem_total))
        setMeter(ref.disk, ratio(m.disk_used, m.disk_total))
      }
      const used = monthUsed(n)
      ref.traffic.el.hidden = !(n.traffic_limit > 0)
      if (n.traffic_limit > 0) setMeter(ref.traffic, (used / n.traffic_limit) * 100)
      ref.meters.hidden = !m && !(n.traffic_limit > 0)

      if (wants() && onScreen.has(n.id)) wantPing(n.id)
      drawLat()

      ref.feats.hidden = !c.show_specs
      if (c.show_specs) {
        const items = feats(n)
        const key = JSON.stringify(items)
        if (key !== featsKey) {
          featsKey = key
          clear(ref.feats)
          for (const [a, b] of items) ref.feats.append(h("li", null, h("span", null, a, b ? h("span", { class: "dim", text: b }) : null)))
        }
      }
    },
  }
}

/* ── one node as a list row: name and load on the left, up to three probes in
   the middle (name, last hour's line, latest ms), ↓ ↑ stacked on the right ── */

/** A window's loss: 0%, 0.5%, 3%, 12% — one decimal only below ten. */
const lossText = (l) => (l == null ? "—" : l === 0 ? "0%" : l < 10 ? `${(Math.round(l * 10) / 10).toString()}%` : `${Math.round(l)}%`)

/** A probe's name cut to fit a column: the carrier when it names one, else its start. */
function probeShort(name) {
  const carrier = /电信|联通|移动|广电|教育网|CT|CU|CM/i.exec(name)
  if (carrier) return carrier[0].toUpperCase()
  return [...name].slice(0, /[\u4e00-\u9fff]/.test(name) ? 2 : 4).join("")
}

function makeRow(node) {
  const ref = {}
  let cur = node
  ref.dot = h("i", { class: "dot" })
  ref.name = h("span", { class: "node-name" })
  ref.cc = h("span", { class: "cc" })
  // the system's icon, where the row has no column for it: after the flag when
  // the name leaves room, otherwise at the end of the second line
  ref.osn = h("span", { class: "osn" })
  ref.oss = h("span", { class: "oss" })
  ref.subt = h("span", { class: "subt" })
  ref.sub = h("div", { class: "sub" }, ref.subt, ref.oss)
  ref.lat = h("div", { class: "lanes" })
  ref.rx = h("span")
  ref.tx = h("span")
  ref.net = h("div", { class: "net" }, ref.rx, ref.tx)
  ref.os = h("div", { class: "os" })      // shown where the row is wide enough
  const el = h("a", { class: "row", href: `/node/${encodeURIComponent(node.id)}`, "data-route": true },
    h("div", { class: "who" }, h("div", { class: "nm" }, ref.dot, ref.name, ref.cc, ref.osn), ref.sub),
    ref.os, ref.lat, ref.net, h("span", { class: "go", "aria-hidden": true, text: "→" }))

  const wants = () => state.config.show_latency && cur.online
  ref.osn.__row = el
  osRoom?.observe(ref.osn)
  el.__nodeId = node.id
  el.__nameEl = ref.name
  el.__wantsPing = wants
  seenObserver?.observe(el)
  if (!seenObserver) onScreen.add(node.id)
  let latKey = ""
  const lanes = new Map()
  const drawLat = () => {
    const rows = wants() ? pingCache.get(cur.id)?.rows?.slice(0, 3) : null
    const key = rows ? JSON.stringify(rows.map((r) => [r.name, r.last, r.loss, r.vals.length, r.vals[r.vals.length - 1]])) : "none"
    if (key === latKey) return
    latKey = key
    if (!rows || !rows.length) { clear(ref.lat); lanes.clear(); return }
    const ids = rows.map((r) => r.id)
    for (const id of [...lanes.keys()]) if (!ids.includes(id)) { lanes.get(id).el.remove(); lanes.delete(id) }
    rows.forEach((r) => {
      let lane = lanes.get(r.id)
      if (!lane) {
        lane = { k: h("span", { class: "k" }), ms: h("b"), loss: h("i"), sparkAt: h("span", { class: "sp" }) }
        lane.v = h("span", { class: "v" }, lane.ms, lane.loss)
        lane.el = h("div", { class: "lane" }, lane.k, lane.sparkAt, lane.v)
        lanes.set(r.id, lane)
      }
      place(ref.lat, lane.el, rows.indexOf(r))
      const sig = JSON.stringify([r.vals.length, r.vals[r.vals.length - 1], r.vals[0]])
      if (sig !== lane.sig) {
        lane.sparkAt.replaceChildren(sparkline(r.vals, { w: 160, h: 14, motion: lane.sig ? "shift" : "draw" }))
        lane.sig = sig
      }
      setText(lane.k, probeShort(r.name))
      lane.el.title = `${r.name} ${r.last == null ? "超时" : Math.round(r.last) + " ms"} · 最近 1 小时丢包 ${lossText(r.loss)}`
      lane.v.className = r.last == null || r.loss >= 5 ? "v bad" : r.loss >= 1 ? "v warn" : "v"
      setNum(lane.ms, r.last == null ? "超时" : String(Math.round(r.last)))
      setText(lane.loss, r.loss == null ? "" : `·${lossText(r.loss)}`)
    })
  }
  pingWatch.set(node.id, drawLat)

  let subKey = "", osKey = null
  return {
    el,
    destroy() { seenObserver?.unobserve(el); osRoom?.unobserve(ref.osn); onScreen.delete(node.id); pingWatch.delete(node.id) },
    update(n) {
      cur = n
      el.classList.toggle("is-off", !n.online)
      const ok = `${n.os}|${n.arch}|${n.virt}`
      if (ok !== osKey) {
        osKey = ok
        const name = osName(n.os).replace(/\s+LTS$/, "")
        const more = [n.arch, n.virt && n.virt !== "none" ? n.virt : null].filter(Boolean).join(" · ")
        ref.os.replaceChildren(...(name ? [osIcon(n.os),
          h("div", { class: "os-t" }, h("span", { text: name }), more ? h("small", { text: more }) : null)] : []))
        ref.os.title = [osName(n.os), n.kernel].filter(Boolean).join(" · ")
        const icon = osIcon(n.os)
        ref.osn.replaceChildren(...(icon ? [icon] : []))
        ref.oss.replaceChildren(...(icon ? [osIcon(n.os)] : []))
        ref.osn.title = ref.os.title
      }
      const m = n.online ? n.metrics : null
      ref.dot.className = `dot ${n.online ? (m ? "on" : "wait") : "off"}`
      setText(ref.name, n.name)
      setFlag(ref.cc, cc(n))

      // second line: load when reporting, otherwise why it is not
      const parts = []
      if (m) {
        parts.push(["", `CPU ${pct(m.cpu, 0)}`], ["", `内存 ${pct(ratio(m.mem_used, m.mem_total), 0)}`])
        // share of the period's traffic allowance, for nodes that have one
        if (n.traffic_limit > 0) {
          const t = (monthUsed(n) / n.traffic_limit) * 100
          parts.push([t >= 95 ? "bad" : t >= 80 ? "warn" : "", `流量 ${pct(t, 0)}`])
        }
        parts.push(["wide", `磁盘 ${pct(ratio(m.disk_used, m.disk_total), 0)}`])
      } else {
        const ago = sinceSeen(n)
        parts.push([n.online ? "warn" : "bad", n.online ? "已连接，等待首次上报" : ago == null ? "从未上报" : `离线 ${uptime(ago)}`])
      }
      const d = state.config.show_expiry ? expiryDays(n) : null
      if (d != null && d <= 7) parts.push([d < 0 ? "bad" : "warn", expiryText(d)])
      if (n.public_remark) parts.push(["remark", n.public_remark])
      const key = JSON.stringify(parts)
      if (key !== subKey) {
        subKey = key
        clear(ref.subt)
        parts.forEach(([cls, t], i) => append(ref.subt, [i ? h("span", { class: `sep ${cls === "wide" || cls === "remark" ? cls : ""}`, text: " · " }) : null, h("span", { class: cls || null, text: t })]))
      }

      ref.net.style.visibility = m ? "" : "hidden"    // keeps its column, so the arrow stays put
      if (m) {
        setText(ref.rx, `↓ ${rateShort(m.net_rx)}`)
        setText(ref.tx, `↑ ${rateShort(m.net_tx)}`)
      }
      if (wants() && onScreen.has(n.id)) wantPing(n.id)
      drawLat()
    },
  }
}

/* ════════════════════════ node page ════════════════════════ */

let detail = null

const WINDOWS = [1, 3, 6, 12, 24, 168, 360, 720, 2160]
function windows(historyDays) {
  const whole = Math.max(1, Math.round(historyDays)) * 24
  const hours = [...WINDOWS.filter((x) => x * 1.25 <= whole), whole]
  return [...new Set(hours)]
}
// short, so eight of them fit one row on a phone; the full wording is the button's title
const windowLabel = (x) => (x < 24 ? `${x}时` : `${Math.round(x / 24)}天`)
const windowTitle = (x) => (x < 24 ? `最近 ${x} 小时` : `最近 ${Math.round(x / 24)} 天`)

const PALETTE = [
  { color: "var(--accent)" },
  { color: "var(--term-red)" },
  { color: "var(--ok)" },
  { color: "var(--warn)" },
  { color: "#3b82f6" },
  { color: "#a855f7" },
  { color: "var(--mute)" },
  { color: "var(--ink)", dash: "4 3" },
  { color: "var(--term-red)", dash: "4 3" },
  { color: "var(--ok)", dash: "4 3" },
]

function renderNode(id) {
  clear(shell.main)
  const r = (detail = { id, tab: "metrics", hours: 6, data: null, timer: null, charts: [], built: !!state.nodes })
  const node = state.nodes?.find((n) => String(n.id) === String(id))

  r.title = h("h1", { class: entry("display reveal") })
  r.lede = h("p", { class: entry("lede reveal reveal-2") })
  r.chip = h("div", { class: entry("chip reveal reveal-3") })
  r.stats = {}
  r.statSub = {}
  const stat = (key, label) => h("div", { class: "stat" },
    h("div", { class: "val", ref: (el) => (r.stats[key] = el) }),
    h("div", { class: "lbl", ref: (el) => (r.statSub[key] = el), text: label }))
  r.tabSeg = h("div", { class: "seg", role: "group", "aria-label": "图表" })
  r.rangeSeg = h("div", { class: "seg", role: "group", "aria-label": "时间范围" })
  r.chartBox = h("div")
  r.spec = h("dl", { class: "spec" })
  // Takes its full height at once, as placeholders, so the charts below do not
  // jump down when the month of history arrives.
  r.uptime = h("div", { class: "panel uptime" },
    h("div", { class: "uptime-head" }, h("span", { class: "panel-title", text: "在线率" }), h("span", { class: "uptime-val" }, h("b", { class: "sk", text: "100%" }))),
    h("div", { class: "beats", "aria-hidden": true }, Array.from({ length: 30 }, () => h("i", { class: "none sk" }))),
    h("div", { class: "uptime-ends" }, h("span", { text: "\u00a0" })))

  shell.main.append(
    h("div", { class: "wrap crumb" }, h("a", { href: "/#nodes", text: "← 全部节点", on: { click: (e) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      e.preventDefault()
      // back to where the visitor was on the list, when that is where they came from
      if (cameFromHome) history.back(); else go("/#nodes")
    } } })),
    h("section", { class: "node-hero" },
      h("div", { class: "wrap stack" }, r.title, r.lede, r.chip)),
    h("div", { class: "wrap" },
      h("div", { class: "stats", style: { marginBottom: "16px" } },
        stat("cpu", "CPU"), stat("mem", "内存"), stat("disk", "磁盘"), stat("net", "网速")),
      r.uptime,
      h("div", { class: "panel" },
        h("div", { class: "panel-head" }, r.tabSeg, r.rangeSeg),
        r.chartBox),
      h("div", { class: "panel" },
        h("div", { class: "panel-head" }, h("span", { class: "panel-title", text: "节点信息" })),
        r.spec)),
    h("div", { class: "page-end" }))

  // chart tabs
  for (const [key, label] of [["metrics", "资源"], ["ping", "延迟"]]) {
    r.tabSeg.append(h("button", { type: "button", "data-k": key, text: label,
      on: { click: () => { r.tab = key; remember(); syncSeg(); loadHistory() } } }))
  }
  const hours = windows(state.me?.history_days ?? 7)
  r.hours = hours.includes(6) ? 6 : hours[0]
  try {
    const saved = JSON.parse(localStorage.getItem("kerf-chart") || "{}")
    if (saved.tab === "metrics" || saved.tab === "ping") r.tab = saved.tab
    if (hours.includes(saved.hours)) r.hours = saved.hours
  } catch { /* storage unavailable */ }
  const remember = () => { try { localStorage.setItem("kerf-chart", JSON.stringify({ tab: r.tab, hours: r.hours })) } catch { /* ignore */ } }
  for (const x of hours) {
    r.rangeSeg.append(h("button", { type: "button", "data-k": String(x), text: windowLabel(x), title: windowTitle(x), "aria-label": windowTitle(x),
      on: { click: () => { r.hours = x; remember(); syncSeg(); loadHistory() } } }))
  }
  function syncSeg() {
    for (const b of r.tabSeg.children) b.setAttribute("aria-pressed", String(b.dataset.k === r.tab))
    for (const b of r.rangeSeg.children) b.setAttribute("aria-pressed", String(Number(b.dataset.k) === r.hours))
  }
  syncSeg()

  if (!node && state.nodes) {
    setText(r.title, "找不到这个节点")
    setText(r.lede, "它可能已被删除，或者没有公开。")
    r.chip.hidden = true
    return
  }
  updateNode()
  loadHistory()
  loadUptime()
  r.timer = setInterval(() => { if (!document.hidden) loadHistory(true) }, 60_000)
}

function updateNode() {
  const r = detail
  if (!r) return
  const n = state.nodes?.find((x) => String(x.id) === String(r.id))
  if (!n) return
  r.node = n
  const m = n.online ? n.metrics : null
  setText(r.title, n.name)
  setTitle([n.name, state.me?.site_name || "Monitor"].join(" · "))
  r.lede.hidden = !n.public_remark
  setText(r.lede, n.public_remark || "")

  const ago = sinceSeen(n)
  const status = n.online ? (m ? "● 在线" : "● 等待上报") : `● 离线${ago == null ? "" : ` ${uptime(ago)}`}`
  const code = cc(n)
  const bits = [osName(n.os), n.arch, n.virt].filter(Boolean)
  const chipKey = JSON.stringify([status, code, bits])
  if (chipKey !== r.chipKey) {
  r.chipKey = chipKey
  clear(r.chip)
  if (code) bits.unshift(code)
  append(r.chip, [
    h("b", { text: status, style: { color: n.online ? (m ? "var(--ok)" : "var(--warn)") : "var(--bad)" } }),
    bits.length ? [h("span", { class: "sep", text: "—" }), bits.map((b, i) => [i ? h("span", { class: "sep", text: "·" }) : null,
      i === 0 && code ? (state.config.country_style === "color" || state.config.country_style === "grey"
        ? h("span", { class: "flags" }, flag(code), h("span", { text: code })) : h("span", { text: code })) : h("span", { text: b })])] : null])
  }

  const val = (k, main, small) => { clear(r.stats[k]); r.stats[k].append(main, small ? h("small", { text: small }) : null) }
  if (m) {
    val("cpu", pct(m.cpu), `${n.cpu_cores || ""} 核`.trim())
    val("mem", pct(ratio(m.mem_used, m.mem_total), 0), bytes(m.mem_used))
    val("disk", pct(ratio(m.disk_used, m.disk_total), 0), bytes(m.disk_used))
    // rates, not shares of a capacity: one quiet line, both directions alike
    clear(r.stats.net)
    r.stats.net.append(h("span", { class: "rates" }, h("span", null, h("i", { text: "↓" }), rateShort(m.net_rx)), h("span", null, h("i", { text: "↑" }), rateShort(m.net_tx))))
  } else for (const k of ["cpu", "mem", "disk", "net"]) val(k, "—")

  // spec sheet
  const rows = []
  const add = (k, v, mono) => { if (v != null && v !== "") rows.push([k, v, mono]) }
  add("系统", osName(n.os))
  add("内核", n.kernel, true)
  add("架构 / 虚拟化", [n.arch, n.virt].filter(Boolean).join(" · "))
  add("CPU", [n.cpu_cores ? `${n.cpu_cores} 核` : "", cpuName(n.cpu_name)].filter(Boolean).join(" · "))
  const mt = n.mem_total || m?.mem_total, st = n.swap_total || m?.swap_total, dt = n.disk_total || m?.disk_total
  add("内存", m ? `${bytes(m.mem_used)} / ${bytes(mt)}` : mt ? bytes(mt) : "")
  add("Swap", st > 0 ? (m ? `${bytes(m.swap_used)} / ${bytes(st)}` : bytes(st)) : "")
  add("磁盘", m ? `${bytes(m.disk_used)} / ${bytes(dt)}` : dt ? bytes(dt) : "")
  if (m) {
    add("运行时间", uptime(m.uptime))
    add("负载", m.load.map((x) => x.toFixed(2)).join("  "), true)
    add("TCP / UDP / 进程", `${m.tcp} / ${m.udp} / ${m.procs}`, true)
  }
  const used = monthUsed(n)
  add("本期流量", n.traffic_limit > 0 ? `${bytes(used)} / ${bytes(n.traffic_limit)}` : bytes(used))
  add("累计流量", `↓ ${bytes(n.total_rx)}  ↑ ${bytes(n.total_tx)}`)
  if (n.price > 0) add("价格", `${money(n.price, n.currency || "CNY")} ${per(n.billing_cycle)}`)
  const ex = expiryText(expiryDays(n))
  if (ex) add("到期", `${ex}${n.expires_at ? ` · ${String(n.expires_at).slice(0, 10)}` : ""}`)
  if (n.group) add("分组", n.group)
  add("agent", n.agent_version, true)
  // The hub sends hostname, addresses and the private note only to a signed-in
  // operator, but this page is the public one and gets screenshotted and shared
  // while signed in; they stay in the panel.
  const key = JSON.stringify(rows)
  if (key !== r.specKey) {
    r.specKey = key
    clear(r.spec)
    for (const [k, v, mono] of rows) r.spec.append(h("div", null, h("dt", { text: k }), h("dd", { class: mono ? "mono" : null, text: v })))
  }
}

async function loadHistory(quiet) {
  const r = detail
  if (!r) return
  const want = `${r.tab}:${r.hours}`
  r.want = want
  if (!quiet) {
    clear(r.chartBox)
    r.chartBox.append(h("div", { class: "chart-empty mono", text: "加载中…" }))
  }
  const width = Math.max(320, r.chartBox.clientWidth || 600)
  const points = Math.max(60, Math.min(1440, Math.round(width * Math.min(2, devicePixelRatio || 1))))
  try {
    const data = await api(`/nodes/${encodeURIComponent(r.id)}/metrics?hours=${r.hours}&points=${points}&series=${r.tab}`)
    if (detail !== r || r.want !== want) return
    r.data = data || {}
    // lines are drawn in when the visitor asked for them, not on the minute's refresh
    chartIntro = !quiet
    drawHistory()
    chartIntro = false
  } catch (e) {
    if (detail !== r || r.want !== want) return
    clear(r.chartBox)
    r.chartBox.append(h("div", { class: "chart-empty" },
      h("div", null, h("div", { text: e.message }),
        h("button", { class: "btn btn-ghost btn-sm", type: "button", style: { marginTop: "12px" }, text: "重试", on: { click: () => loadHistory() } }))))
  }
}

function drawHistory() {
  const r = detail
  const d = r.data
  clear(r.chartBox)
  r.charts = []
  if (r.tab === "ping") return drawPing(d)

  const rows = Array.isArray(d.metrics) ? d.metrics.filter((p) => p && isNum(p.ts)) : []
  if (!rows.length) {
    r.chartBox.append(h("div", { class: "chart-empty", text: "这段时间没有数据" }))
    return
  }
  const step = isNum(d.step) && d.step > 0 ? d.step : medianStep(rows.map((p) => p.ts))
  const gap = step * 1.5 * 1000
  const n = r.node || {}
  const memTotal = n.mem_total || n.metrics?.mem_total
  const diskTotal = n.disk_total || n.metrics?.disk_total
  const t = (p) => p.ts * 1000
  const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null)

  const grid = h("div", { class: "charts two" })
  r.chartBox.append(grid)
  const add = (opts) => { const c = chart(opts); grid.append(c.el); r.charts.push(c) }

  add({ label: "CPU", gap, max: 100, fmt: (v) => `${v.toFixed(0)}%`, tipFmt: (v) => pct(v),
    series: [{ name: "CPU", ...PALETTE[0], area: true, pts: rows.map((p) => [t(p), num(p.cpu)]) },
      ...(rows.some((p) => isNum(p.cpu_max)) ? [{ name: "峰值", color: "var(--mute)", dash: "2 3", pts: rows.map((p) => [t(p), num(p.cpu_max)]) }] : [])] })
  add({ label: "内存", gap, max: memTotal ? 100 : undefined,
    fmt: memTotal ? (v) => `${v.toFixed(0)}%` : (v) => bytes(v, 0),
    tipFmt: memTotal ? (v) => `${pct(v)} · ${bytes((v / 100) * memTotal)}` : (v) => bytes(v),
    series: [{ name: "内存", ...PALETTE[0], area: true,
      pts: rows.map((p) => [t(p), num(p.mem_used) == null ? null : memTotal ? (p.mem_used / memTotal) * 100 : p.mem_used]) }] })
  const lastNum = (key) => { for (let i = rows.length - 1; i >= 0; i--) if (isNum(rows[i][key])) return rows[i][key]; return null }
  const rxNow = lastNum("net_rx"), txNow = lastNum("net_tx")
  add({ label: "网络", gap, fmt: (v) => rateShort(v), tipFmt: (v) => rate(v),
    current: rxNow == null ? "" : `↓ ${rateShort(rxNow)}  ↑ ${rateShort(txNow ?? 0)}`,
    series: [
      { name: "↓ 下行", ...PALETTE[0], pts: rows.map((p) => [t(p), num(p.net_rx)]), peak: rows.map((p) => num(p.net_rx_max)) },
      { name: "↑ 上行", color: "var(--term-red)", pts: rows.map((p) => [t(p), num(p.net_tx)]), peak: rows.map((p) => num(p.net_tx_max)) }] })
  add({ label: "磁盘", gap, max: diskTotal ? 100 : undefined,
    fmt: diskTotal ? (v) => `${v.toFixed(0)}%` : (v) => bytes(v, 0),
    tipFmt: diskTotal ? (v) => `${pct(v)} · ${bytes((v / 100) * diskTotal)}` : (v) => bytes(v),
    series: [{ name: "磁盘", ...PALETTE[0], area: true,
      pts: rows.map((p) => [t(p), num(p.disk_used) == null ? null : diskTotal ? (p.disk_used / diskTotal) * 100 : p.disk_used]) }] })
}

/* ── availability: a bar a day, from the minutes each hour of history holds ── */

async function loadUptime() {
  const r = detail
  const days = Math.max(1, Math.min(30, Math.round(state.me?.history_days ?? 7)))
  let d
  // nothing to show keeps the panel, and its height, with a line saying so
  const none = () => {
    r.uptime.querySelector(".uptime-val").replaceChildren(h("small", { text: "暂无记录" }))
    for (const i of r.uptime.querySelectorAll(".beats i")) i.classList.remove("sk")
  }
  try {
    d = await api(`/nodes/${encodeURIComponent(r.id)}/metrics?hours=${days * 24}&points=${days * 24}&series=metrics`)
  } catch { if (detail === r) none(); return }
  if (detail !== r) return
  const rows = Array.isArray(d?.metrics) ? d.metrics.filter((p) => p && isNum(p.ts)) : []
  if (!rows.length) return none()
  const step = isNum(d.step) && d.step > 0 ? d.step : medianStep(rows.map((p) => p.ts))
  const now = Date.now()
  const start = now - days * 86_400_000
  const dayStart = (ms) => { const x = new Date(ms); x.setHours(0, 0, 0, 0); return x.getTime() }
  // minutes reported, per local day; a hub too old to say counts each row as whole
  const up = new Map()
  for (const p of rows) {
    const k = dayStart(p.ts * 1000)
    up.set(k, (up.get(k) || 0) + (isNum(p.minutes) ? p.minutes : step / 60))
  }
  const first = dayStart(rows[0].ts * 1000)
  const bars = []
  let sumUp = 0, sumAll = 0
  for (let k = dayStart(start); k <= now; k = dayStart(k + 26 * 3_600_000)) {
    const next = dayStart(k + 26 * 3_600_000)       // 26 h: lands in the next day whatever the clocks did
    // before the node's first report there is nothing to hold against it, and
    // its first day counts from that report
    if (k < first) { bars.push({ k, pct: null }); continue }
    const all = (Math.min(next, now) - Math.max(k, start, k === first ? rows[0].ts * 1000 : 0)) / 60_000
    if (all < 1) continue
    const got = Math.min(all, up.get(k) || 0)
    sumUp += got
    sumAll += all
    bars.push({ k, pct: (got / all) * 100 })
  }
  if (!sumAll) return none()
  const total = (sumUp / sumAll) * 100
  const show = (v) => (v >= 99.995 ? "100%" : `${v.toFixed(v >= 99 ? 2 : 1)}%`)
  const date = (k) => { const x = new Date(k); return `${x.getMonth() + 1}月${x.getDate()}日` }
  clear(r.uptime)
  r.uptime.append(
    h("div", { class: "uptime-head" },
      h("span", { class: "panel-title", text: "在线率" }),
      h("span", { class: "uptime-val" }, h("b", { class: total >= 99 ? "ok" : total >= 90 ? "warn" : "bad", text: show(total) }), h("small", { text: `近 ${Math.min(days, bars.filter((b) => b.pct != null).length)} 天` }))),
    h("div", { class: "beats", role: "img", "aria-label": `近 ${days} 天在线率 ${show(total)}` },
      bars.map((b) => h("i", {
        // a few lost minutes a day are the hub restarting, not the node: amber
        // starts at a quarter of an hour, red at an outage of hours
        class: b.pct == null ? "none" : b.pct >= 99 ? "ok" : b.pct >= 90 ? "warn" : "bad",
        title: `${date(b.k)} · ${b.pct == null ? "没有记录" : show(b.pct)}`,
      }))),
    h("div", { class: "uptime-ends" }, h("span", { text: date(bars[0].k) }), h("span", { text: "今天" })))
}

/* ── latency heartbeat: a row of pills per line -- answered, partly lost, lost ── */

function beatStrip(series) {
  const all = series.flatMap((x) => x.pts)
  if (!all.length) return null
  let t0 = Infinity, t1 = -Infinity
  for (const [t] of all) { if (t < t0) t0 = t; if (t > t1) t1 = t }
  const cells = innerWidth < 640 ? 30 : 60
  const span = Math.max(1, t1 - t0)
  const label = (i) => timeLabel(t0 + ((i + 0.5) / cells) * span, span)
  return h("div", { class: "beat-rows" },
    series.map((x) => {
      const sum = new Array(cells).fill(0), got = new Array(cells).fill(0), lost = new Array(cells).fill(0)
      for (const [t, v] of x.pts) {
        const i = Math.min(cells - 1, Math.floor(((t - t0) / span) * cells))
        if (v == null) lost[i]++; else { sum[i] += v; got[i]++ }
      }
      return [h("span", { class: "beat-name", text: x.name, title: x.name }),
        h("div", { class: "beats", "aria-hidden": true }, got.map((n, i) => h("i", {
          class: !n && !lost[i] ? "none" : !lost[i] ? "ok" : lost[i] >= n ? "bad" : "warn",
          title: `${label(i)} · ${n ? `${Math.round(sum[i] / n)} ms` : ""}${lost[i] ? `${n ? " · " : ""}超时 ${lost[i]} 次` : ""}${!n && !lost[i] ? "没有记录" : ""}`,
        })))]
    }),
    h("span"), h("div", { class: "beat-key" }, h("span", { text: timeLabel(t0, span) }),
      h("span", { text: "绿 正常 · 黄 有超时 · 红 不通" }), h("span", { text: timeLabel(t1, span) })))
}

// probe ids whose line the visitor has switched off on the latency chart
const hiddenProbes = new Set()

function drawPing(d) {
  const r = detail
  const ping = Array.isArray(d.ping) ? d.ping.filter((p) => p && isNum(p.ts)) : []
  if (!ping.length) {
    r.chartBox.append(h("div", { class: "chart-empty", text: "这个节点没有延迟监控，或这段时间没有数据" }))
    return
  }
  // one line per probe, in the order the operator arranged them
  const ids = [...new Set(ping.map((p) => p.task_id))]
  const probes = d.probes && typeof d.probes === "object" ? d.probes : {}
  const loss = d.loss && typeof d.loss === "object" ? d.loss : {}
  const series = ids.map((id, i) => {
    const pts = ping.filter((p) => p.task_id === id).map((p) => [p.ts * 1000, typeof p.latency === "number" ? p.latency : null])
    return { id, name: String(probes[id] ?? `探测 ${id}`), ...PALETTE[i % PALETTE.length], pts,
      gap: medianStep(pts.map((p) => p[0] / 1000)) * 3 * 1000, loss: Number(loss[id]) || 0,
      avg: avg(pts.map((p) => p[1])) }
  })
  // Click a line's name to hide it; the scale then fits what is left. The
  // choice is kept while the page is open, across ranges and refreshes.
  const box = h("div")
  r.chartBox.append(box)
  let shown = null
  const render = () => {
    if (shown) r.charts.splice(r.charts.indexOf(shown), 1)
    if (series.every((x) => hiddenProbes.has(x.id))) hiddenProbes.clear()
    const visible = series.filter((x) => !hiddenProbes.has(x.id))
    shown = chart({ label: "延迟", tall: true, current: "", fmt: (v) => `${Math.round(v)} ms`, tipFmt: (v) => `${Math.round(v)} ms`, series: visible })
    r.charts.push(shown)
    box.replaceChildren(shown.el, h("div", { class: "legend", role: "group", "aria-label": "显示的线路" },
      series.map((x) => {
        const off = hiddenProbes.has(x.id)
        return h("button", { type: "button", class: off ? "off" : null, "aria-pressed": String(!off),
          title: off ? "点击显示" : series.length > 1 ? "点击隐藏" : null,
          on: { click: () => { off ? hiddenProbes.delete(x.id) : hiddenProbes.add(x.id); render() } } },
          h("i", { style: { background: x.color, opacity: x.dash ? ".6" : "1" } }),
          x.name,
          h("em", { text: `${x.avg == null ? "—" : Math.round(x.avg) + " ms"}${x.loss > 0 ? ` · 丢 ${x.loss < 1 ? "<1" : Math.round(x.loss)}%` : ""}` }))
      })))
    const beats = beatStrip(visible)
    if (beats) box.append(beats)
  }
  render()
}

function medianStep(ts) {
  const d = []
  for (let i = 1; i < ts.length; i++) if (ts[i] > ts[i - 1]) d.push(ts[i] - ts[i - 1])
  if (!d.length) return 60
  d.sort((a, b) => a - b)
  return d[Math.floor(d.length / 2)]
}
function avg(vs) {
  let s = 0, n = 0
  for (const v of vs) if (typeof v === "number") { s += v; n++ }
  return n ? s / n : null
}
function niceMax(v) {
  if (!(v > 0)) return 1
  const p = 10 ** Math.floor(Math.log10(v))
  for (const k of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (k * p >= v) return k * p
  return 10 * p
}
function niceBytesMax(v) {
  if (!(v > 0)) return 1024
  const i = Math.floor(Math.log(v) / Math.log(1024))
  const u = 1024 ** i
  return niceMax(v / u) * u
}

function timeLabel(ms, span) {
  const d = new Date(ms)
  const pad = (x) => String(x).padStart(2, "0")
  return span > 2 * 86400_000 ? `${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * A small SVG line chart. series: [{ name, color, dash?, area?, pts: [[ms, v|null]], gap? }]
 * Lines break across nulls and across gaps wider than `gap` ms.
 */
let chartIntro = false
function chart({ label, series, max, fmt, tipFmt, gap, tall, current }) {
  const svgEl = s("svg", { role: "img", "aria-label": label })
  if (chartIntro && motionOK()) {
    svgEl.classList.add("draw")
    setTimeout(() => svgEl.classList.remove("draw"), 1300)   // a later redraw (resize) is not an entrance
  }
  const tip = h("div", { class: "tip", hidden: true })
  const cur = h("span", { class: "v" })
  const el = h("div", { class: `chart${tall ? " tall" : ""}` },
    h("div", { class: "chart-label" }, h("span", { class: "k", text: label }), cur), svgEl, tip)

  let xs0 = Infinity, xs1 = -Infinity, vmax = 0
  for (const sr of series) for (const [x, v] of sr.pts) {
    if (x < xs0) xs0 = x
    if (x > xs1) xs1 = x
    if (v != null && v > vmax) vmax = v
  }
  const isBytes = fmt && fmt(1024 * 1024).includes("M")
  const top = max ?? (isBytes ? niceBytesMax(vmax * 1.1) : niceMax(vmax * 1.1))
  const lastOf = (sr) => { for (let i = sr.pts.length - 1; i >= 0; i--) if (sr.pts[i][1] != null) return sr.pts[i][1]; return null }
  const first = series[0] && lastOf(series[0])
  setText(cur, current !== undefined ? current : first != null ? (tipFmt || fmt)(first) : "")

  let geom = null
  function draw() {
    const W = Math.max(200, el.clientWidth || svgEl.clientWidth || 600)
    const H = svgEl.clientHeight || (tall ? 220 : 140)
    const padL = 0, padR = W < 480 ? 44 : 52, padT = 6, padB = 18
    const iw = W - padL - padR, ih = H - padT - padB
    const span = Math.max(1, xs1 - xs0)
    const X = (x) => padL + ((x - xs0) / span) * iw
    const Y = (v) => padT + ih - (Math.min(v, top) / top) * ih
    geom = { X, Y, W, H, padL, padR, padT, padB, iw, ih, span }
    clear(svgEl)
    svgEl.setAttribute("viewBox", `0 0 ${W} ${H}`)
    // grid + y labels
    for (const f of [0, 0.5, 1]) {
      const y = Math.round(padT + ih - f * ih) + 0.5
      svgEl.append(s("line", { class: "grid-line", x1: padL, x2: padL + iw, y1: y, y2: y }))
      svgEl.append(s("text", { class: "axis", x: W, y: y + 3, "text-anchor": "end", text: fmt(top * f) }))
    }
    // x labels
    if (Number.isFinite(xs0) && Number.isFinite(xs1)) {
      for (const f of [0, 1 / 3, 2 / 3, 1]) {
        const x = xs0 + f * span
        svgEl.append(s("text", { class: "axis", x: X(x), y: H - 2, "text-anchor": f === 0 ? "start" : f === 1 ? "end" : "middle", text: timeLabel(x, span) }))
      }
    }
    for (const sr of series) {
      const g = sr.gap ?? gap ?? Infinity
      let d = "", area = "", prev = null, runStart = null
      const close = () => { if (runStart != null && prev) area += `L${prev[0]},${padT + ih}L${runStart},${padT + ih}Z` }
      for (const [x, v] of sr.pts) {
        if (v == null || (prev && x - prev.t > g)) { close(); prev = null; runStart = null; if (v == null) continue }
        const px = X(x).toFixed(1), py = Y(v).toFixed(1)
        if (!prev) { d += `M${px},${py}`; area += `M${px},${padT + ih}L${px},${py}`; runStart = px }
        else { d += `L${px},${py}`; area += `L${px},${py}` }
        prev = [px, py]; prev.t = x
      }
      close()
      if (sr.area && area) svgEl.append(s("path", { class: "area", d: area, style: { fill: `color-mix(in srgb, ${sr.color} 7%, transparent)` } }))
      if (d) svgEl.append(s("path", { class: "series", d, "stroke-dasharray": sr.dash, style: { stroke: sr.color } }))
    }
    geom.hover = s("line", { class: "hover-line", y1: padT, y2: padT + ih, x1: 0, x2: 0, visibility: "hidden" })
    svgEl.append(geom.hover)
  }

  function nearest(sr, x) {
    const p = sr.pts
    let lo = 0, hi = p.length - 1
    if (hi < 0) return null
    while (lo < hi) { const mid = (lo + hi) >> 1; if (p[mid][0] < x) lo = mid + 1; else hi = mid }
    let best = lo
    if (lo > 0 && Math.abs(p[lo - 1][0] - x) < Math.abs(p[lo][0] - x)) best = lo - 1
    return best
  }
  const onPoint = (e) => {
    if (!geom || !Number.isFinite(xs0)) return
    const rect = svgEl.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * geom.W
    const x = xs0 + ((px - geom.padL) / geom.iw) * geom.span
    const idx0 = nearest(series[0], x)
    const tx = idx0 == null ? x : series[0].pts[idx0][0]
    geom.hover.setAttribute("x1", geom.X(tx)); geom.hover.setAttribute("x2", geom.X(tx)); geom.hover.setAttribute("visibility", "visible")
    clear(tip)
    tip.append(h("div", { class: "t", text: new Date(tx).toLocaleString("zh-CN", { hour12: false }) }))
    for (const sr of series) {
      const i = nearest(sr, tx)
      if (i == null) continue
      const [px2, v] = sr.pts[i]
      if (Math.abs(px2 - tx) > (sr.gap ?? gap ?? Infinity)) continue
      const peak = sr.peak?.[i]
      tip.append(h("div", null, h("i", { style: { background: sr.color } }), `${sr.name}  `,
        v == null ? "超时" : (tipFmt || fmt)(v), peak != null && v != null && peak > v ? h("span", { class: "mute", text: ` · 峰 ${(tipFmt || fmt)(peak)}` }) : null))
    }
    tip.hidden = false
    const left = (geom.X(tx) / geom.W) * rect.width
    tip.style.left = `${Math.min(Math.max(0, left + 12), rect.width - tip.offsetWidth)}px`
  }
  svgEl.addEventListener("pointermove", onPoint)
  svgEl.addEventListener("pointerdown", onPoint)
  svgEl.addEventListener("pointerleave", () => {
    tip.hidden = true
    if (geom) geom.hover.setAttribute("visibility", "hidden")
  })

  requestAnimationFrame(draw)
  return { el, draw }
}

let resizeTimer = null
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => (detail || home)?.charts?.forEach((c) => c.draw()), 120)
})

/* ════════════════════════ top level ════════════════════════ */

function renderClosed() {
  clear(shell.main)
  home = null
  shell.main.append(h("section", { class: "closing wrap", style: { padding: "160px 0" } },
    h("h1", { class: "display" }, "需要登录后查看。"),
    h("p", { class: "lede", text: "站长关闭了公开状态页。" }),
    h("a", { class: "btn btn-primary", href: "/admin/", text: "登录" })))
}

function route() {
  if (detail?.timer) clearInterval(detail.timer)
  detail = null
  home = null
  if (state.closed) return renderClosed()
  const rt = parseRoute()
  for (const a of [shell.navHome, shell.navNodes]) a.removeAttribute("aria-current")
  if (rt.name === "node") renderNode(rt.id)
  else {
    setTitle(state.me?.site_name || "Monitor")
    shell.navHome.setAttribute("aria-current", "page")
    renderHome()
  }
}

function onNodes(nodes) {
  state.nodes = nodes
  state.updatedAt = new Date()
  state.error = null
  const wasClosed = state.closed
  state.closed = false
  setDown(nodes.filter((n) => !n.online).length)
  updateShell()
  if (wasClosed) return route()
  if (home) updateHome()
  else if (detail) {
    // a node page opened before the first frame: build it now that data is here
    if (!detail.built) { route(); return }
    updateNode()
  }
}

async function main() {
  buildShell()
  startStream({
    onNodes,
    onError: (msg) => { state.error = msg; updateShell() },
    onClosed: () => { if (!state.closed) { state.closed = true; route() } },
  })
  const [me, config] = await Promise.all([api("/me").catch((e) => { state.error = e.message; return null }), loadConfig()])
  state.me = me
  state.config = config
  if (config.accent && config.accent !== "mono") document.documentElement.dataset.accent = config.accent
  if (me && !me.public_page && !me.authed) { location.href = "/admin/"; return }
  updateShell()
  route()
}

main()
