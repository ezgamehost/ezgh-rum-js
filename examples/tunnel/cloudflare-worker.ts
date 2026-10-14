// cloudflare-worker.ts — route https://shop.example.com/_ezgh* to this Worker, then init({ tunnel: "/_ezgh" }).
// It forwards POST /_ezgh?path=/v1/{traces,logs}&… to obs-browser with the query and body unchanged,
// and never forwards Cookie or Authorization (sendBeacon carries the site's cookies).
const PATHS = new Set(["/v1/traces", "/v1/logs"])
export default {
  async fetch(req: Request, env: { EZGH_RUM_UPSTREAM?: string }): Promise<Response> {
    const url = new URL(req.url)
    const path = url.searchParams.get("path") ?? ""
    if (req.method !== "POST" || !PATHS.has(path)) return new Response(null, { status: 404 })
    const body = await req.arrayBuffer()
    if (body.byteLength > 1 << 20) return new Response(null, { status: 413 })
    const headers = new Headers({ "Content-Type": req.headers.get("Content-Type") ?? "text/plain;charset=UTF-8" })
    const origin = req.headers.get("Origin")
    if (origin) headers.set("Origin", origin)
    const client = req.headers.get("CF-Connecting-IP")
    if (client) headers.set("X-Forwarded-For", [req.headers.get("X-Forwarded-For"), client].filter(Boolean).join(", "))
    const up = await fetch(`${env.EZGH_RUM_UPSTREAM ?? "https://obs-browser.ezghcloud.com"}${path}${url.search}`, { method: "POST", headers, body })
    const out = new Headers()
    for (const h of ["Content-Type", "Retry-After"]) {
      const v = up.headers.get(h)
      if (v) out.set(h, v)
    }
    return new Response(up.body, { status: up.status, headers: out })
  },
}
