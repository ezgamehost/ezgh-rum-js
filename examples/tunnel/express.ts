// express.ts — app.use("/_ezgh", ezghTunnel()), then init({ tunnel: "/_ezgh" }). Set
// app.set("trust proxy", …) for your load balancer so req.ip is the browser's address.
// It never forwards Cookie or Authorization (sendBeacon carries the site's cookies).
import express, { type NextFunction, type Request, type Response, type Router } from "express"
const PATHS = new Set(["/v1/traces", "/v1/logs"])
export function ezghTunnel(upstream = process.env.EZGH_RUM_UPSTREAM ?? "https://obs-browser.ezghcloud.com"): Router {
  const r = express.Router()
  r.post("/", express.raw({ type: () => true, limit: "1mb" }), async (req: Request, res: Response) => {
    const path = typeof req.query.path === "string" ? req.query.path : ""
    if (!PATHS.has(path)) {
      res.sendStatus(404)
      return
    }
    const xff = [req.get("X-Forwarded-For"), req.ip].filter(Boolean).join(", ")
    const headers: Record<string, string> = { "Content-Type": req.get("Content-Type") ?? "text/plain;charset=UTF-8", "X-Forwarded-For": xff }
    const origin = req.get("Origin")
    if (origin) headers.Origin = origin
    const query = req.originalUrl.slice(req.originalUrl.indexOf("?"))
    try {
      const up = await fetch(`${upstream}${path}${query}`, { method: "POST", headers, body: req.body as Uint8Array<ArrayBuffer> })
      for (const h of ["Content-Type", "Retry-After"]) {
        const v = up.headers.get(h)
        if (v) res.setHeader(h, v) // setHeader relays it as is (res.set adds a charset)
      }
      res.status(up.status).end(Buffer.from(await up.arrayBuffer()))
    }
    catch {
      res.sendStatus(502)
    }
  })
  // express.raw answers a body over the limit with a 413 error; send just the status.
  r.use((err: { status?: number }, _req: Request, res: Response, next: NextFunction) => {
    if (err.status === 413) res.sendStatus(413)
    else next(err)
  })
  r.all("/", (_req: Request, res: Response) => {
    res.sendStatus(404) // only POST
  })
  return r
}
