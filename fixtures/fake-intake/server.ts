// The fake intake for the Playwright suite (plan 25 J7), three listeners:
//   :4318  the browser host: OPTIONS, POST /v1/{traces,logs} and POST /tunnel?path=…, recording per
//          `ct`; scripted responses (POST /_respond?ct=), GET /_captured?ct=, POST /_reset?ct=.
//   :4319  a traced API: GET /api/items records traceparent/tracestate per ?ct=.
//   :4320  an untraced origin: GET /api/other records whether traceparent was present.
const TOKEN = /^ezgh_ct_[A-Za-z0-9]{43}$/
const PATHS = new Set(["/v1/traces", "/v1/logs"])

export interface Capture { ct: string, path: string, via: "direct" | "tunnel", size: number, query: Record<string, string>, origin: string | null, contentType: string | null, gzip: boolean, body: unknown, raw: string, at: number }
const captured = new Map<string, Capture[]>()
const scripted = new Map<string, Array<{ status: number, retryAfter?: string }>>()
const traced = new Map<string, Array<{ traceparent: string | null, tracestate: string | null }>>()
const untraced = new Map<string, Array<{ traceparent: boolean }>>()

const push = <T>(m: Map<string, T[]>, k: string, v: T) => {
  const a = m.get(k) ?? []
  a.push(v)
  m.set(k, a)
}
function cors(req: Request, extra: Record<string, string> = {}): Headers {
  const h = new Headers(extra)
  const origin = req.headers.get("Origin")
  if (origin) {
    h.set("Access-Control-Allow-Origin", origin)
    h.set("Vary", "Origin")
  }
  return h
}
const json = (req: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors(req, { "Content-Type": "application/json" }) })

Bun.serve({
  port: 4318,
  async fetch(req) {
    const url = new URL(req.url)
    const ct = url.searchParams.get("ct") ?? ""
    if (url.pathname === "/_health") return new Response("ok")
    if (url.pathname === "/_captured") return json(req, captured.get(ct) ?? [])
    if (url.pathname === "/_reset") {
      captured.delete(ct)
      scripted.delete(ct)
      traced.delete(ct)
      untraced.delete(ct)
      return json(req, {})
    }
    if (url.pathname === "/_respond") {
      scripted.set(ct, await req.json() as Array<{ status: number, retryAfter?: string }>)
      return json(req, {})
    }
    if (url.pathname === "/_traced") return json(req, { traced: traced.get(ct) ?? [], untraced: untraced.get(ct) ?? [] })
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(req, { "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "content-type" }) })
    }
    const path = url.pathname === "/tunnel" ? url.searchParams.get("path") ?? "" : url.pathname
    if (req.method !== "POST" || !PATHS.has(path)) return new Response(null, { status: 404, headers: cors(req) })
    if (!TOKEN.test(ct)) return json(req, { code: 16, message: "bad token" }, 401)
    const gzip = url.searchParams.get("enc") === "gzip"
    const bytes = new Uint8Array(await req.arrayBuffer())
    const raw = new TextDecoder().decode(gzip ? Bun.gunzipSync(bytes) : bytes)
    let body: unknown
    try {
      body = JSON.parse(raw)
    }
    catch {
      return json(req, { code: 3, message: "bad json" }, 400)
    }
    push(captured, ct, { ct, path, via: url.pathname === "/tunnel" ? "tunnel" : "direct", size: bytes.byteLength, query: Object.fromEntries(url.searchParams), origin: req.headers.get("Origin"), contentType: req.headers.get("Content-Type"), gzip, body, raw, at: Date.now() })
    const next = scripted.get(ct)?.shift()
    const headers = cors(req, { "Content-Type": "application/json", "Access-Control-Expose-Headers": "Retry-After" })
    if (next?.retryAfter) headers.set("Retry-After", next.retryAfter)
    return new Response(next && next.status !== 200 ? "{}" : "{\"partialSuccess\":{}}", { status: next?.status ?? 200, headers })
  },
})

Bun.serve({
  port: 4319,
  fetch(req) {
    const url = new URL(req.url)
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(req, { "Access-Control-Allow-Methods": "GET", "Access-Control-Allow-Headers": "traceparent, tracestate" }) })
    }
    if (url.pathname === "/api/items") {
      push(traced, url.searchParams.get("ct") ?? "", { traceparent: req.headers.get("traceparent"), tracestate: req.headers.get("tracestate") })
      return json(req, { items: [1, 2, 3] })
    }
    return new Response(null, { status: 404, headers: cors(req) })
  },
})

Bun.serve({
  port: 4320,
  fetch(req) {
    const url = new URL(req.url)
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req, { "Access-Control-Allow-Methods": "GET", "Access-Control-Allow-Headers": "traceparent, tracestate" }) })
    if (url.pathname === "/api/other") {
      push(untraced, url.searchParams.get("ct") ?? "", { traceparent: req.headers.has("traceparent") })
      return json(req, { ok: true })
    }
    return new Response(null, { status: 404, headers: cors(req) })
  },
})

console.log("fake intake on :4318, traced API on :4319, untraced origin on :4320")
