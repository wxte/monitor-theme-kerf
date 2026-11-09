// A stand-in hub for developing the theme without a real one.
// Serves dist/ with SPA fallback and the five read endpoints, including the
// /api/ws push (gzip binary frames when asked). No dependencies.
//
//   node tools/mock-hub.mjs [port]          then open http://127.0.0.1:9911
//   MOCK_CLOSED=1  → public page closed (401s)
//   MOCK_NOWS=1    → refuse WebSocket (tests the polling fallback)
//   MONITOR_HUB=https://hub.example.com → real data: /api and the push are
//                  forwarded to that hub (its public status page must be open)
import http from "node:http"
import net from "node:net"
import tls from "node:tls"
import { readFile } from "node:fs/promises"
import { createHash } from "node:crypto"
import { gzipSync } from "node:zlib"
import { extname, join, normalize } from "node:path"

const PORT = Number(process.argv[2] || 9911)
const DIST = new URL("../dist/", import.meta.url).pathname
const CLOSED = !!process.env.MOCK_CLOSED
const HUB = process.env.MONITOR_HUB ? new URL(process.env.MONITOR_HUB) : null
const GiB = 1024 ** 3, MiB = 1024 ** 2, TiB = 1024 ** 4

const spec = [
  ["Tokyo-01", "JP", "亚太", "CN2 GIA 回程，晚高峰稳定", 49, "USD", "monthly", 2, 4, 40, 1 * TiB, 30],
  ["Tokyo-02", "JP", "亚太", "", 99, "USD", "monthly", 2, 8, 80, 2 * TiB, 120],
  ["Singapore", "SG", "亚太", "CMIN2 优化线路", 199, "USD", "yearly", 4, 16, 160, 4 * TiB, 5],
  ["Hong Kong", "HK", "亚太", "", 88, "HKD", "quarterly", 1, 1, 20, 500 * GiB, 0],
  ["Los Angeles", "US", "北美", "大盘鸡，跑备份", 0, "USD", "monthly", 4, 8, 500, 0, null],
  ["Frankfurt", "DE", "欧洲", "", 4.5, "EUR", "monthly", 2, 4, 80, 20 * TiB, -3],
  ["Shanghai", "CN", "", "家宽 NAS", 0, "CNY", "once", 4, 16, 4000, 0, null],
  ["Amsterdam", "NL", "欧洲", "", 120, "CNY", "semiannual", 1, 2, 30, 1 * TiB, 64],
  ["Seoul", "KR", "亚太", "", 3000, "JPY", "monthly", 2, 2, 40, 1 * TiB, 12],
]
const start = Date.now() / 1000
const nodes = spec.map(([name, country, group, remark, price, currency, cycle, cores, mem, disk, limit, exp], i) => ({
  id: i + 1, name, sort: i, public: true, online: i !== 5 && i !== 3, country, group,
  public_remark: remark, last_seen: start - (i === 5 ? 3 * 3600 : i === 3 ? 400 : 2),
  last_seen_ago: i === 5 ? 3 * 3600 : i === 3 ? 400 : 2,
  os: i === 6 ? "Ubuntu 24.04.1 LTS" : "Debian GNU/Linux 12 (bookworm)", kernel: "6.1.0-28-amd64",
  arch: i === 7 ? "aarch64" : "x86_64", virt: i === 6 ? "none" : "kvm",
  cpu_name: i % 2 ? "Intel(R) Xeon(R) Platinum 8375C CPU @ 2.90GHz" : "AMD Ryzen 9 9950X 16-Core Processor",
  cpu_cores: cores, mem_total: mem * GiB, swap_total: i % 3 ? 1 * GiB : 0, disk_total: disk * GiB,
  agent_version: "1.4.0", price, currency, billing_cycle: cycle,
  expires_at: exp == null ? null : new Date(Date.now() + exp * 864e5).toISOString().slice(0, 10), expires_in: exp,
  traffic_limit: limit, traffic_mode: "sum", traffic_reset_day: 1,
  total_rx: (i + 3) * 211 * GiB, total_tx: (i + 2) * 97 * GiB,
  month_rx: (i + 1) * 23 * GiB, month_tx: (i + 1) * 11 * GiB, month_used: (i + 1) * 34 * GiB,
  month_start: "2026-11-01", day_rx: 3 * GiB, day_tx: GiB,
  base: { cpu: 6 + ((i * 17) % 50), mem: 0.25 + ((i * 13) % 50) / 100, disk: 0.2 + ((i * 7) % 60) / 100, net: (i + 1) * 0.6 * MiB },
}))
// one node has connected but not reported yet
nodes[8].metrics = null

function live(n, t, slow = 7) {
  if (!n.online || n.id === 9) return null
  const w = (k) => Math.sin(t / slow + n.id * k) * 0.5 + 0.5 + (slow > 7 ? Math.sin(t / (slow / 5) + k) * 0.08 : 0)
  const b = n.base
  return {
    uptime: Math.floor(86400 * (n.id * 3.3) + t - start), cpu: +(b.cpu * (0.6 + w(1.3) * 0.8)).toFixed(1),
    load: [b.cpu / 40, b.cpu / 45, b.cpu / 50].map((x) => +x.toFixed(2)),
    mem_total: n.mem_total, mem_used: Math.floor(n.mem_total * b.mem * (0.95 + w(2) * 0.1)),
    swap_total: n.swap_total, swap_used: Math.floor(n.swap_total * 0.1),
    disk_total: n.disk_total, disk_used: Math.floor(n.disk_total * b.disk),
    net_rx: Math.floor(b.net * (0.3 + w(0.7) * 1.6)), net_tx: Math.floor(b.net * 0.35 * (0.3 + w(1.1) * 1.4)),
    total_rx: n.total_rx, total_tx: n.total_tx, month_rx: n.month_rx, month_tx: n.month_tx,
    tcp: 40 + n.id * 13, udp: 6 + n.id, procs: 110 + n.id * 7,
  }
}
function snapshot() {
  const t = Date.now() / 1000
  return { nodes: nodes.map(({ base, ...n }) => ({ ...n, metrics: n.id === 9 ? null : live({ ...n, base }, t) })) }
}

function history(id, hours, points, series) {
  const n = nodes.find((x) => x.id === id)
  const now = Math.floor(Date.now() / 1000)
  const span = hours * 3600
  const raw = Math.floor(span / 60)
  const stepBase = hours > 168 ? 3600 : 60
  let step = stepBase * Math.max(1, Math.ceil(raw / (points * (stepBase / 60))))
  const out = { step, metrics: [], ping: [], probes: { 1: "上海电信", 2: "上海联通", 3: "北京移动" }, loss: { 2: 0.8 } }
  for (let ts = now - span; ts <= now; ts += step) {
    if (n.id === 2 && ts > now - span * 0.62 && ts < now - span * 0.55) continue   // an outage gap
    const m = live({ ...n, online: true, id: n.id === 9 ? 99 : n.id }, ts, Math.max(1800, span / 12)) || live({ ...nodes[0] }, ts, 3600)
    const spike = Math.random() < 0.02 ? 6 : 1
    if (series !== "ping") out.metrics.push({ ts, minutes: step / 60, cpu: m.cpu, cpu_max: Math.min(100, m.cpu * 1.6),
      mem_used: m.mem_used, disk_used: m.disk_used + (ts - now + span) * 2000, swap_used: m.swap_used,
      net_rx: m.net_rx, net_tx: m.net_tx, net_rx_max: m.net_rx * 1.8 * spike, net_tx_max: m.net_tx * 1.5, tcp: m.tcp, udp: m.udp, procs: m.procs })
    if (series !== "metrics") for (const [task, base] of [[1, 38], [2, 52], [3, 71]]) {
      const lost = task === 2 && Math.random() < 0.01
      out.ping.push({ task_id: task, ts, latency: lost ? null : Math.round(base + Math.sin(ts / 3000 + task) * 6 + Math.random() * 4 + (Math.random() < 0.01 ? 40 : 0)),
        ...(Math.random() < 0.03 ? { loss: 8 } : {}) })
    }
  }
  if (series === "metrics") { delete out.ping; delete out.probes; delete out.loss }
  if (series === "ping") delete out.metrics
  out.ping?.sort((a, b) => a.task_id - b.task_id || a.ts - b.ts)
  return out
}

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".woff": "font/woff",
  ".svg": "image/svg+xml", ".png": "image/png", ".txt": "text/plain; charset=utf-8", ".json": "application/json" }
const json = (res, body, status = 200) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(body)) }
const text = (res, body, status) => { res.writeHead(status, { "content-type": "text/plain; charset=utf-8" }); res.end(body) }

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x")
  const p = url.pathname
  if (p.startsWith("/api/") && HUB) {
    try {
      const up = await fetch(new URL(req.url, HUB), { headers: { accept: req.headers.accept || "*/*" } })
      res.writeHead(up.status, { "content-type": up.headers.get("content-type") || "application/octet-stream" })
      return res.end(Buffer.from(await up.arrayBuffer()))
    } catch (e) { return text(res, `连不上 ${HUB.host}：${e.message}`, 502) }
  }
  if (p.startsWith("/api/")) {
    if (p === "/api/me") return json(res, { authed: false, github: false, site_name: "Kerf Status", public_page: !CLOSED, history_days: 30 })
    if (CLOSED) return text(res, "需要登录后查看", 401)
    if (p === "/api/nodes") return json(res, snapshot())
    if (p === "/api/themes/kerf/config") return json(res, process.env.MOCK_CONFIG ? JSON.parse(process.env.MOCK_CONFIG) : {})
    const m = /^\/api\/nodes\/(\d+)\/metrics$/.exec(p)
    if (m) {
      const hours = Math.min(720, Number(url.searchParams.get("hours") || 6))
      const points = Math.max(60, Math.min(1440, Number(url.searchParams.get("points") || 1440)))
      return json(res, history(Number(m[1]), hours, points, url.searchParams.get("series")))
    }
    return text(res, "接口不存在", 404)
  }
  // the real hub serves its built-in admin here, never the theme
  if (p === "/admin" || p.startsWith("/admin/")) return text(res, "（模拟 hub）这里是 hub 内置的后台", 200)
  let file = normalize(join(DIST, decodeURIComponent(p)))
  if (!file.startsWith(DIST)) return text(res, "forbidden", 403)
  try {
    if (file.endsWith("/")) file = join(file, "index.html")
    const body = await readFile(file)
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" })
    return res.end(body)
  } catch {
    const body = await readFile(join(DIST, "index.html"))   // SPA fallback
    res.writeHead(200, { "content-type": TYPES[".html"] })
    res.end(body)
  }
})

// minimal RFC 6455 server side: handshake + unmasked server frames
server.on("upgrade", (req, socket) => {
  const url = new URL(req.url, "http://x")
  if (HUB) {
    // replay the handshake to the real hub with its own Host, then pipe both ways
    const port = Number(HUB.port) || (HUB.protocol === "https:" ? 443 : 80)
    const up = HUB.protocol === "https:" ? tls.connect({ host: HUB.hostname, port, servername: HUB.hostname }) : net.connect(port, HUB.hostname)
    up.on("connect", () => {})
    const head = [`GET ${req.url} HTTP/1.1`, `Host: ${HUB.host}`,
      ...Object.entries(req.headers).filter(([k]) => k !== "host" && k !== "origin").map(([k, v]) => `${k}: ${v}`), "", ""].join("\r\n")
    up.write(head)
    up.pipe(socket); socket.pipe(up)
    up.on("error", () => socket.destroy()); socket.on("error", () => up.destroy())
    return
  }
  if (url.pathname !== "/api/ws" || process.env.MOCK_NOWS || CLOSED) {
    socket.end("HTTP/1.1 503 Service Unavailable\r\n\r\n"); return
  }
  const accept = createHash("sha1").update(req.headers["sec-websocket-key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64")
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`)
  const gzip = url.searchParams.has("gzip")
  const frame = (payload, opcode) => {
    const len = payload.length
    const head = len < 126 ? Buffer.from([0x80 | opcode, len])
      : len < 65536 ? Buffer.from([0x80 | opcode, 126, len >> 8, len & 255])
      : (() => { const b = Buffer.alloc(10); b[0] = 0x80 | opcode; b[1] = 127; b.writeBigUInt64BE(BigInt(len), 2); return b })()
    socket.write(Buffer.concat([head, payload]))
  }
  const push = () => {
    const body = Buffer.from(JSON.stringify(snapshot()))
    gzip ? frame(gzipSync(body), 0x2) : frame(body, 0x1)
  }
  push()
  const timer = setInterval(push, 2000)
  socket.on("data", (b) => { if ((b[0] & 0x0f) === 0x8) socket.end() })
  socket.on("close", () => clearInterval(timer))
  socket.on("error", () => clearInterval(timer))
})

server.listen(PORT, "127.0.0.1", () => console.log(`mock hub on http://127.0.0.1:${PORT}`))
