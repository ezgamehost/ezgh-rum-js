// nextjs-route.ts — save as app/%5Fezgh/route.ts: "%5F" makes the URL /_ezgh, because folders
// starting with "_" are private in the App Router. The platform's proxy has already put the
// browser's address in X-Forwarded-For, so it's passed through as is. Cookie and Authorization
// are never forwarded (sendBeacon carries the site's cookies).
const PATHS = new Set(["/v1/traces", "/v1/logs"])
const UPSTREAM = process.env.EZGH_RUM_UPSTREAM ?? "https://obs-browser.ezghcloud.com"
export async function POST(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const path = url.searchParams.get("path") ?? ""
  if (!PATHS.has(path)) return new Response(null, { status: 404 })
  const body = await req.arrayBuffer()
  if (body.byteLength > 1 << 20) return new Response(null, { status: 413 })
  const headers = new Headers({ "Content-Type": req.headers.get("Content-Type") ?? "text/plain;charset=UTF-8" })
  for (const h of ["Origin", "X-Forwarded-For"]) {
    const v = req.headers.get(h)
    if (v) headers.set(h, v)
  }
  const up = await fetch(`${UPSTREAM}${path}${url.search}`, { method: "POST", headers, body })
  const out = new Headers()
  for (const h of ["Content-Type", "Retry-After"]) {
    const v = up.headers.get(h)
    if (v) out.set(h, v)
  }
  return new Response(up.body, { status: up.status, headers: out })
}
