// Kerf — public status page theme for monitor.
// Plain ES module, no dependencies. Every string that comes from the hub or from
// a node goes into the page through textContent, never as markup.
import { manifest } from "./manifest.js"

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
const rateShort = (n) => bytes(n, n >= 1024 * 100 ? 0 : 1).replace(" ", "").replace(/([KMGTP])B$/, "$1") + "/s"
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
    let f = MONEY.get(currency)
    if (!f) {
      // zh-CN fixed: US$ / HK$ / JP¥ stay distinct from the yuan's ¥
      f = new Intl.NumberFormat("zh-CN", { style: "currency", currency, maximumFractionDigits: 2 })
      MONEY.set(currency, f)
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
}

function parseRoute() {
  const m = /^\/node\/([^/]+)\/?$/.exec(location.pathname)
  return m ? { name: "node", id: decodeURIComponent(m[1]) } : { name: "home" }
}
function go(path) {
  if (location.pathname + location.hash === path) return
  const url = new URL(path, location.href)
  // same page, different anchor: just scroll
  if (url.pathname === location.pathname && home) {
    history.pushState(null, "", path)
    document.getElementById(url.hash.slice(1))?.scrollIntoView({ behavior: "smooth" })
    return
  }
  history.pushState(null, "", path)
  route()
  if (!path.includes("#")) window.scrollTo({ top: 0, behavior: "instant" })
}
document.addEventListener("click", (e) => {
  const a = e.target.closest?.("a[data-route]")
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
  e.preventDefault()
  go(a.getAttribute("href"))
})
window.addEventListener("popstate", () => route())

/* ════════════════════════ group helpers ════════════════════════ */

const groupsOf = (nodes) => [...new Set(nodes.map((n) => n.group ?? "").filter(Boolean))]
function inGroup(nodes) {
  const g = state.group
  if (!g) return nodes
  return nodes.filter((n) => (n.group ?? "") === g.name)
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

function toggleTheme() {
  const root = document.documentElement
  const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches
  const next = dark ? "light" : "dark"
  root.dataset.theme = next
  try { localStorage.setItem("kerf-theme", next) } catch { /* private mode */ }
}

const shell = {}
function buildShell() {
  const app = document.getElementById("app")
  clear(app)
  shell.siteName = h("span", { text: "Monitor" })
  shell.footName = h("span", { text: "Monitor" })
  shell.admin = h("a", { class: "btn btn-primary btn-sm", href: "/admin/", text: "登录" })
  shell.navHome = h("a", { href: "/#overview", "data-route": true, text: "概览" })
  shell.navNodes = h("a", { href: "/#nodes", "data-route": true, text: "节点" })
  shell.banner = h("div", { class: "banner", role: "status", hidden: true })
  shell.main = h("main", { id: "main" })
  shell.footText = h("p", { hidden: true })
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
      h("div", { class: "wrap" },
        h("div", { class: "foot-grid" },
          h("div", null,
            h("a", { class: "brand", href: "/", "data-route": true },
              h("img", { src: "/favicon.svg", alt: "", width: 24, height: 24 }), shell.footName),
            shell.footText),
          h("div", { class: "foot-cols" },
            h("div", null, h("h4", { text: "状态" }),
              h("ul", null,
                h("li", null, h("a", { href: "/#overview", "data-route": true, text: "概览" })),
                h("li", null, h("a", { href: "/#nodes", "data-route": true, text: "节点" })))),
            h("div", null, h("h4", { text: "站点" }),
              h("ul", null,
                h("li", null, h("a", { href: "/admin/", text: "后台" })),
                h("li", null, h("a", { href: "https://github.com/monitor-probe/monitor", target: "_blank", rel: "noopener", text: "monitor" })))))),
        h("div", { class: "foot-bottom" },
          h("span", null, "© ", shell.footYear),
          h("span", { class: "mono", text: `theme ${manifest.short} ${manifest.version}`.trim() })))))
}

function updateShell() {
  const name = state.me?.site_name || "Monitor"
  setText(shell.siteName, name)
  setText(shell.footName, name)
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

function renderHome() {
  clear(shell.main)
  const c = state.config
  const r = (home = { cards: new Map(), rows: new Map(), groupsKey: null })

  r.title = h("h1", { class: "display xl reveal" })
  r.chip = h("div", { class: "chip reveal reveal-3" })
  r.notice = c.notice
    ? h("div", { class: "notice reveal" }, h("span", { class: "tag", text: "公告" }), h("span", { class: "txt", text: c.notice }))
    : null

  // terminal report
  r.termTitle = h("span")
  r.termCmd = h("div", { class: "cmd line" })
  r.termHost = h("div", { class: "line" })
  r.termRows = h("div", { class: "term-rows" })
  r.termNote = h("div", { class: "comment" })
  const term = c.show_terminal
    ? h("div", { class: "wrap reveal reveal-4" },
      h("div", { class: "term narrow", "aria-label": "实时报告" },
        h("div", { class: "term-bar", "aria-hidden": true }, h("i"), h("i"), h("i"), r.termTitle),
        r.termCmd, r.termHost, r.termRows, r.termNote))
    : null

  r.stats = {}
  const stat = (key, label) => h("div", { class: "stat" },
    h("div", { class: "val", ref: (el) => (r.stats[key] = el) }), h("div", { class: "lbl", text: label }))
  r.tabs = h("div", { class: "tabs", hidden: true })
  r.list = h("div", { class: c.layout === "list" ? "rows" : "grid" })
  r.empty = h("div", { class: "empty", hidden: true, text: "这里还没有节点" })
  r.sectionLede = h("p", { class: "lede" })
  r.closingTitle = h("h2", { class: "h2" })
  r.closingLede = h("p", { class: "lede small mono" })

  shell.main.append(
    h("section", { class: "hero", id: "overview" },
      h("div", { class: "wrap stack" },
        r.notice,
        r.title,
        c.hero_subtitle ? h("p", { class: "lede reveal reveal-2", text: c.hero_subtitle }) : null,
        r.chip)),
    term,
    h("section", { class: "section", id: "nodes" },
      h("div", { class: "wrap" },
        h("div", { class: "section-head" }, h("h2", { class: "h2", text: "节点" }), r.sectionLede),
        r.tabs,
        h("div", { class: "stats", style: { marginBottom: "28px" } },
          stat("online", "在线节点"), stat("rx", "实时下行"), stat("tx", "实时上行"), stat("month", "本期流量")),
        r.list, r.empty)),
    h("section", { class: "closing wrap" },
      r.closingTitle, r.closingLede))

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
  const key = JSON.stringify([groups, hasUngrouped, state.group?.name ?? null])
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
        return h("button", { class: "tab", type: "button", "aria-pressed": pressed ? "true" : "false",
          on: { click: () => { state.group = sel; r.groupsKey = null; updateHome() } } }, h("span", { text: label }), count)
      }
      r.tabs.append(h("div", { class: "tabs-in", role: "group", "aria-label": "分组" },
        tab("全部", null),
        groups.map((g) => tab(g, { name: g })),
        hasUngrouped ? tab("未分组", { name: "" }) : null))
    }
  }
  if (r.tabCount) {
    for (const [name, el] of r.tabCount) {
      const n = name === null ? all.length : all.filter((x) => (x.group ?? "") === name).length
      setText(el, String(n))
    }
  }

  const nodes = inGroup(all)
  const sum = summarize(nodes)

  // hero chip: "12 在线 · 2 离线 — JP · SG · US"
  clear(r.chip)
  if (state.nodes) {
    const countries = [...new Set(nodes.map(cc).filter(Boolean))]
    const shown = countries.slice(0, 5)
    append(r.chip, [
      h("b", { text: `${sum.online} 在线` }),
      sum.offline ? [h("span", { class: "sep", text: "·" }), h("b", { text: `${sum.offline} 离线` })] : null,
      shown.length ? [h("span", { class: "sep", text: "—" }),
        shown.map((x, i) => [i ? h("span", { class: "sep", text: "·" }) : null, h("span", { text: x })]),
        countries.length > 5 ? h("span", { text: `+${countries.length - 5}` }) : null] : null])
  } else {
    r.chip.append(h("span", { text: "正在连接…" }))
  }

  // section copy
  setText(r.sectionLede, state.group
    ? `${state.group.name || "未分组"} · ${sum.total} 个节点，汇总数字跟随所选分组。`
    : `共 ${sum.total} 个节点${groups.length ? `，${groups.length} 个分组` : ""}。点进任意节点查看历史曲线与延迟。`)

  // stats strip
  setText(r.stats.online, `${sum.online}/${sum.total}`)
  setText(r.stats.rx, rate(sum.rx))
  setText(r.stats.tx, rate(sum.tx))
  setText(r.stats.month, bytes(sum.month))

  // terminal report
  if (c.show_terminal) updateTerminal(r, nodes, sum, site)

  // node list (keyed, updated in place)
  const list = c.layout === "list" ? r.rows : r.cards
  const make = c.layout === "list" ? makeRow : makeCard
  const seen = new Set()
  nodes.forEach((n) => {
    seen.add(n.id)
    let item = list.get(n.id)
    if (!item) { item = make(n); list.set(n.id, item) }
    item.update(n)
    r.list.append(item.el)          // re-appending keeps the operator's order
  })
  for (const [id, item] of list) if (!seen.has(id)) { item.destroy?.(); item.el.remove(); list.delete(id) }
  r.empty.hidden = !state.nodes || nodes.length > 0

  // closing band
  setText(r.closingTitle, !state.nodes ? "正在连接。" : sum.total === 0 ? "还没有节点。"
    : sum.offline === 0 ? "所有节点运行正常。" : `${sum.offline} 个节点离线。`)
  setText(r.closingLede, state.updatedAt ? `# 最后更新 ${clock(state.updatedAt)} · 每 2 秒推送` : "# 等待第一帧数据")
}

function updateTerminal(r, nodes, sum, site) {
  const limit = Math.round(state.config.terminal_rows) || 5
  setText(r.termTitle, `monitor — ${site}`)
  setText(r.termCmd, `monitor top --sort traffic --limit ${limit}`)
  setText(r.termHost, `HOST: ${location.host}  (${sum.online} online · ${sum.total} nodes)`)
  const load = (n) => (n.online && n.metrics ? n.metrics.net_rx + n.metrics.net_tx : -1)
  const top = [...nodes].sort((a, b) => load(b) - load(a)).slice(0, limit)
  clear(r.termRows)
  top.forEach((n, i) => {
    const m = n.online ? n.metrics : null
    const code = cc(n)
    r.termRows.append(
      h("span", { class: "n", text: `${i + 1}.` }),
      h("span", { class: "nm" }, n.name, code ? h("small", { text: code }) : null),
      m ? h("span", { class: "v" }, h("span", { class: "lo", text: "cpu " }), pct(m.cpu))
        : h("span", { class: "v off", text: n.online ? "waiting" : "offline" }),
      h("span", { class: "v wide" }, m ? [h("span", { class: "lo", text: "mem " }), pct(ratio(m.mem_used, m.mem_total), 0)] : ""),
      h("span", { class: "v" }, m ? [h("span", { class: "lo", text: "↓" }), rateShort(m.net_rx)] : ""),
      h("span", { class: "v wide" }, m ? [h("span", { class: "lo", text: "↑" }), rateShort(m.net_tx)] : ""))
  })
  setText(r.termNote, `# live snapshot · ${state.updatedAt ? clock(state.updatedAt) : "--:--:--"} · pushed every 2s`)
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

/* ── latency on cards: the last hour of each probe, fetched only for cards on
   screen, at most once a minute each and three at a time ── */

const PING_TTL = 60_000
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
  if (c && Date.now() - c.at < PING_TTL) return
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
      .then((d) => pingCache.set(id, { at: Date.now(), rows: summarizePing(d) }))
      // keep what was shown; try again after the TTL
      .catch(() => pingCache.set(id, { at: Date.now(), rows: prev?.rows ?? null }))
      .finally(() => { pingActive--; pingWatch.get(id)?.(); pumpPing() })
  }
}

const seenObserver = typeof IntersectionObserver === "function"
  ? new IntersectionObserver((entries) => {
    for (const e of entries) {
      const id = e.target.__nodeId
      if (e.isIntersecting) { onScreen.add(id); if (e.target.__wantsPing?.()) wantPing(id) }
      else onScreen.delete(id)
    }
  }, { rootMargin: "200px 0px" })
  : null

function sparkline(vals) {
  const W = 64, H = 18
  const nums = vals.filter((v) => v != null)
  const svg = s("svg", { class: "spark", viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none", "aria-hidden": true })
  if (nums.length < 2) return svg
  let lo = Math.min(...nums), hi = Math.max(...nums)
  if (hi - lo < 4) { const mid = (hi + lo) / 2; lo = mid - 2; hi = mid + 2 }
  const n = vals.length
  let d = ""
  let pen = false
  vals.forEach((v, i) => {
    if (v == null) { pen = false; return }
    const x = n === 1 ? W / 2 : (i / (n - 1)) * W
    const y = H - 1.5 - ((v - lo) / (hi - lo)) * (H - 3)
    d += `${pen ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`
    pen = true
  })
  svg.append(s("path", { d }))
  return svg
}

function makeCard(node) {
  const ref = {}
  ref.dot = h("i", { class: "dot" })
  ref.name = h("span")
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
  ref.link = h("a", { class: "btn btn-primary btn-block", href: `/node/${encodeURIComponent(node.id)}`, "data-route": true, text: "查看详情" })
  const el = h("article", { class: "card", tabindex: -1 },
    h("div", { class: "card-head" },
      h("div", { class: "t" }, h("div", { class: "card-name" }, ref.dot, ref.name), ref.desc),
      ref.cc),
    h("div", null, h("div", { class: "big" }, ref.num, ref.unit), ref.note),
    ref.link, ref.meters, ref.lat)
  el.addEventListener("click", (e) => {
    if (e.target.closest("a") || getSelection()?.toString()) return
    go(`/node/${encodeURIComponent(node.id)}`)
  })

  let cur = node
  const wants = () => state.config.show_latency && cur.online
  el.__nodeId = node.id
  el.__wantsPing = wants
  seenObserver?.observe(el)
  if (!seenObserver) onScreen.add(node.id)

  let latKey = ""
  const drawLat = () => {
    const rows = wants() ? pingCache.get(cur.id)?.rows : null
    const key = rows ? JSON.stringify(rows.map((r) => [r.name, r.last, r.loss, r.vals.length, r.vals[r.vals.length - 1]])) : "none"
    if (key === latKey) return
    latKey = key
    ref.lat.hidden = !rows || rows.length === 0
    clear(ref.lat)
    if (!rows) return
    const MAX = 3
    for (const r of rows.slice(0, MAX)) {
      const lossCls = r.loss == null ? "loss" : r.loss >= 5 ? "loss bad" : r.loss >= 1 ? "loss warn" : "loss"
      ref.lat.append(h("div", { class: "lat-row" },
        h("span", { class: "nm", text: r.name }),
        sparkline(r.vals),
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
      const desc = n.public_remark || ""
      ref.desc.hidden = !desc
      setText(ref.desc, desc)
      setText(ref.cc, cc(n))
      el.classList.toggle("is-off", !n.online)

      if (c.show_price && n.price > 0) {
        setText(ref.num, money(n.price, n.currency || "CNY"))
        setText(ref.unit, per(n.billing_cycle))
        ref.num.classList.remove("off")
      } else if (m) {
        setText(ref.num, pct(m.cpu))
        setText(ref.unit, "CPU")
        ref.num.classList.remove("off")
      } else {
        setText(ref.num, n.online ? "等待上报" : "离线")
        setText(ref.unit, "")
        ref.num.classList.toggle("off", !n.online)
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
    },
  }
}

/* ── one node as a list row ── */

function makeRow(node) {
  const ref = {}
  ref.dot = h("i", { class: "dot" })
  ref.name = h("span")
  ref.cc = h("em")
  ref.sub = h("div", { class: "sub" })
  ref.met = h("div", { class: "met" })
  const el = h("a", { class: "row", href: `/node/${encodeURIComponent(node.id)}`, "data-route": true },
    h("div", { style: { minWidth: 0 } }, h("div", { class: "nm" }, ref.dot, ref.name, ref.cc), ref.sub),
    ref.met, h("span", { class: "go", "aria-hidden": true, text: "→" }))
  return {
    el,
    update(n) {
      const m = n.online ? n.metrics : null
      ref.dot.className = `dot ${n.online ? (m ? "on" : "wait") : "off"}`
      setText(ref.name, n.name)
      setText(ref.cc, cc(n))
      setText(ref.sub, n.public_remark || [osName(n.os), n.arch].filter(Boolean).join(" · "))
      clear(ref.met)
      if (m) {
        ref.met.append(
          h("span", null, "cpu ", h("b", { text: pct(m.cpu, 0) })),
          h("span", { class: "wide" }, "mem ", h("b", { text: pct(ratio(m.mem_used, m.mem_total), 0) })),
          h("span", null, "↓ ", h("b", { text: rateShort(m.net_rx) })),
          h("span", { class: "wide" }, "↑ ", h("b", { text: rateShort(m.net_tx) })))
      } else {
        const ago = sinceSeen(n)
        ref.met.append(h("span", { style: { color: n.online ? "var(--warn)" : "var(--bad)" },
          text: n.online ? "等待上报" : ago == null ? "从未上报" : `离线 ${uptime(ago)}` }))
      }
    },
  }
}

/* ════════════════════════ node page ════════════════════════ */

let detail = null

const WINDOWS = [1, 6, 24, 168, 720, 2160]
function windows(historyDays) {
  const whole = Math.max(1, Math.round(historyDays)) * 24
  const hours = [...WINDOWS.filter((x) => x * 1.25 <= whole), whole]
  return [...new Set(hours)]
}
const windowLabel = (x) => (x < 24 ? `${x} 小时` : `${Math.round(x / 24)} 天`)

const PALETTE = [
  { color: "var(--ink)" },
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

  r.title = h("h1", { class: "display reveal" })
  r.lede = h("p", { class: "lede reveal reveal-2" })
  r.chip = h("div", { class: "chip reveal reveal-3" })
  r.stats = {}
  r.statSub = {}
  const stat = (key, label) => h("div", { class: "stat" },
    h("div", { class: "val", ref: (el) => (r.stats[key] = el) }),
    h("div", { class: "lbl", ref: (el) => (r.statSub[key] = el), text: label }))
  r.tabSeg = h("div", { class: "seg", role: "group", "aria-label": "图表" })
  r.rangeSeg = h("div", { class: "seg", role: "group", "aria-label": "时间范围" })
  r.chartBox = h("div")
  r.spec = h("dl", { class: "spec" })

  shell.main.append(
    h("div", { class: "wrap crumb" }, h("a", { href: "/#nodes", "data-route": true, text: "← 全部节点" })),
    h("section", { class: "node-hero" },
      h("div", { class: "wrap stack" }, r.title, r.lede, r.chip)),
    h("div", { class: "wrap" },
      h("div", { class: "stats", style: { marginBottom: "16px" } },
        stat("cpu", "CPU"), stat("mem", "内存"), stat("disk", "磁盘"), stat("net", "网速 ↓ / ↑")),
      h("div", { class: "panel" },
        h("div", { class: "panel-head" }, r.tabSeg, r.rangeSeg),
        r.chartBox),
      h("div", { class: "panel" },
        h("div", { class: "panel-head" }, h("span", { class: "panel-title", text: "节点信息" })),
        r.spec)),
    h("div", { style: { height: "80px" } }))

  // chart tabs
  for (const [key, label] of [["metrics", "资源"], ["ping", "延迟"]]) {
    r.tabSeg.append(h("button", { type: "button", "data-k": key, text: label,
      on: { click: () => { r.tab = key; syncSeg(); loadHistory() } } }))
  }
  const hours = windows(state.me?.history_days ?? 7)
  r.hours = hours.includes(6) ? 6 : hours[0]
  for (const x of hours) {
    r.rangeSeg.append(h("button", { type: "button", "data-k": String(x), text: windowLabel(x),
      on: { click: () => { r.hours = x; syncSeg(); loadHistory() } } }))
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
  document.title = [n.name, state.me?.site_name || "Monitor"].join(" · ")
  r.lede.hidden = !n.public_remark
  setText(r.lede, n.public_remark || "")

  clear(r.chip)
  const ago = sinceSeen(n)
  const status = n.online ? (m ? "● 在线" : "● 等待上报") : `● 离线${ago == null ? "" : ` ${uptime(ago)}`}`
  const bits = [cc(n), osName(n.os), n.arch, n.virt].filter(Boolean)
  append(r.chip, [
    h("b", { text: status, style: { color: n.online ? (m ? "var(--ok)" : "var(--warn)") : "var(--bad)" } }),
    bits.length ? [h("span", { class: "sep", text: "—" }), bits.map((b, i) => [i ? h("span", { class: "sep", text: "·" }) : null, h("span", { text: b })])] : null])

  const val = (k, main, small) => { clear(r.stats[k]); r.stats[k].append(main, small ? h("small", { text: small }) : null) }
  if (m) {
    val("cpu", pct(m.cpu), `${n.cpu_cores || ""} 核`.trim())
    val("mem", pct(ratio(m.mem_used, m.mem_total), 0), bytes(m.mem_used))
    val("disk", pct(ratio(m.disk_used, m.disk_total), 0), bytes(m.disk_used))
    val("net", rateShort(m.net_rx), ` / ${rateShort(m.net_tx)}`)
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
  // present only for a signed-in operator
  if (n.hostname) add("主机名", n.hostname, true)
  if (n.ip) add("地址", n.ip, true)
  if (n.remark) add("私有备注", n.remark)
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
    drawHistory()
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
  add({ label: "网络", gap, fmt: (v) => rateShort(v), tipFmt: (v) => rate(v),
    series: [
      { name: "↓ 下行", ...PALETTE[0], pts: rows.map((p) => [t(p), num(p.net_rx)]), peak: rows.map((p) => num(p.net_rx_max)) },
      { name: "↑ 上行", color: "var(--term-red)", pts: rows.map((p) => [t(p), num(p.net_tx)]), peak: rows.map((p) => num(p.net_tx_max)) }] })
  add({ label: "磁盘", gap, max: diskTotal ? 100 : undefined,
    fmt: diskTotal ? (v) => `${v.toFixed(0)}%` : (v) => bytes(v, 0),
    tipFmt: diskTotal ? (v) => `${pct(v)} · ${bytes((v / 100) * diskTotal)}` : (v) => bytes(v),
    series: [{ name: "磁盘", ...PALETTE[0], area: true,
      pts: rows.map((p) => [t(p), num(p.disk_used) == null ? null : diskTotal ? (p.disk_used / diskTotal) * 100 : p.disk_used]) }] })
}

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
  const c = chart({ label: "延迟", tall: true, fmt: (v) => `${Math.round(v)} ms`, tipFmt: (v) => `${Math.round(v)} ms`, series })
  r.chartBox.append(c.el)
  r.charts.push(c)
  r.chartBox.append(h("div", { class: "legend" },
    series.map((x) => h("span", null,
      h("i", { style: { background: x.color, opacity: x.dash ? ".6" : "1" } }),
      x.name,
      h("em", { text: `${x.avg == null ? "—" : Math.round(x.avg) + " ms"}${x.loss > 0 ? ` · 丢 ${x.loss < 1 ? "<1" : Math.round(x.loss)}%` : ""}` })))))
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
function chart({ label, series, max, fmt, tipFmt, gap, tall }) {
  const svgEl = s("svg", { role: "img", "aria-label": label })
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
  setText(cur, series.length === 1 && first != null ? (tipFmt || fmt)(first) : "")

  let geom = null
  function draw() {
    const W = Math.max(200, el.clientWidth || svgEl.clientWidth || 600)
    const H = svgEl.clientHeight || (tall ? 220 : 140)
    const padL = 0, padR = 52, padT = 6, padB = 18
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
  svgEl.addEventListener("pointermove", (e) => {
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
  })
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
  resizeTimer = setTimeout(() => detail?.charts.forEach((c) => c.draw()), 120)
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
    document.title = state.me?.site_name || "Monitor"
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
  if (me && !me.public_page && !me.authed) { location.href = "/admin/"; return }
  updateShell()
  route()
}

main()
