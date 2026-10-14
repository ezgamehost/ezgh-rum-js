// A fake obs-api source-map surface (and org-api's OIDC exchange) for upload and bundler tests:
// it enforces the routes' limits and records every request.
import { createHash } from "node:crypto"

export interface Recorded { method: string, path: string, headers: Record<string, string>, body: Uint8Array }
export interface CommitFile { debugId: string, path: string, kind: "js" | "map", size: number, chunks: string[] }
export interface Commit { application: string, release: string, files: CommitFile[] }
type Scripted = { status: number, retryAfter?: number, error?: Record<string, unknown> }

const PREFIX = /^\/v1\/organizations\/([^/]+)\/projects\/([^/]+)\/obs\/source-maps(\/chunks\/missing|\/chunks)?$/
const MAX_CHUNK = 8 * 1024 * 1024

export function fakeObsApi() {
  const chunks = new Map<string, number>()
  const registered = new Map<string, string>() // debugId:kind → JSON of (size, chunks)
  const requests: Recorded[] = []
  const commits: Commit[] = []
  const scripted = new Map<string, Scripted[]>() // "commit" | "chunks" | "missing" → responses
  let loseOnCommit: string | undefined
  let storageFull = false

  const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...extra } })
  const err = (status: number, code: string, message: string, extra: Record<string, unknown> = {}) =>
    json(status, { error: { code, message, ...extra } })

  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url)
      const body = new Uint8Array(await req.arrayBuffer())
      requests.push({ method: req.method, path: url.pathname + url.search, headers: Object.fromEntries(req.headers), body })
      if (url.pathname === "/gh-token") return json(200, { value: "gh-id-token" })
      const ex = /^\/v1\/organizations\/([^/]+)\/bots\/([^/]+)\/oidc-api-keys$/.exec(url.pathname)
      if (ex) {
        if (req.headers.get("authorization")) return err(400, "invalid_request", "no Authorization on an exchange")
        const b = JSON.parse(new TextDecoder().decode(body)) as { token?: string }
        if (b.token !== "gh-id-token") return err(401, "unauthenticated", "bad token")
        return json(201, { apiKey: { id: "key" }, token: "ezgh_ak_from_oidc" })
      }
      const m = PREFIX.exec(url.pathname)
      if (!m || req.method !== "POST") return err(404, "not_found", "Route not found")
      const auth = req.headers.get("authorization") ?? ""
      if (!auth.startsWith("Bearer ")) return err(401, "unauthenticated", "no key")
      if (auth === "Bearer denied") return err(403, "access_denied", "This API key isn't allowed to obs.sourceMaps.upload")
      const route = m[3] === "/chunks/missing" ? "missing" : m[3] === "/chunks" ? "chunks" : "commit"
      const next = scripted.get(route)?.shift()
      if (next) {
        return new Response(JSON.stringify({ error: { code: "too_many_requests", message: "scripted", ...next.error } }), {
          status: next.status, headers: next.retryAfter !== undefined ? { "Retry-After": String(next.retryAfter) } : {},
        })
      }
      if (route === "missing") {
        const { hashes } = JSON.parse(new TextDecoder().decode(body)) as { hashes: string[] }
        if (hashes.length > 1000) return err(400, "invalid_request", "at most 1,000 hashes")
        return json(200, { missing: hashes.filter(h => !chunks.has(h)) })
      }
      if (route === "chunks") {
        if (!req.headers.get("idempotency-key")) return err(400, "invalid_request", "Idempotency-Key is required")
        if (body.byteLength > MAX_CHUNK) return err(413, "payload_too_large", "over 8 MiB")
        const h = createHash("sha256").update(body).digest("hex")
        if (h !== req.headers.get("x-ezgh-sha256")) return err(400, "invalid_request", "x-ezgh-sha256 doesn't match the body")
        chunks.set(h, body.byteLength)
        return json(200, { sha256: h, size: body.byteLength })
      }
      if (!req.headers.get("idempotency-key")) return err(400, "invalid_request", "Idempotency-Key is required")
      const c = JSON.parse(new TextDecoder().decode(body)) as Commit
      if (c.files.length > 1000) return err(400, "invalid_request", "at most 1,000 files")
      if (loseOnCommit) {
        chunks.delete(loseOnCommit)
        loseOnCommit = undefined
      }
      const missing = [...new Set(c.files.flatMap(f => f.chunks).filter(h => !chunks.has(h)))]
      if (missing.length) return err(409, "chunks_missing", "Some chunks aren't uploaded", { details: { missing } })
      for (const f of c.files) {
        if ("sha256" in f) return err(400, "invalid_request", "files have no sha256 field")
        if (f.chunks.length !== Math.max(1, Math.ceil(f.size / MAX_CHUNK))) return err(400, "invalid_request", "chunk layout")
        const prev = registered.get(`${f.debugId}:${f.kind}`)
        if (prev && prev !== JSON.stringify([f.size, f.chunks])) return err(409, "debug_id_conflict", "A debug ID is registered with other content", { details: { debugIds: [f.debugId] } })
      }
      if (storageFull) return err(409, "storage_limit_exceeded", "The project's source-map storage is full")
      for (const f of c.files) registered.set(`${f.debugId}:${f.kind}`, JSON.stringify([f.size, f.chunks]))
      commits.push(c)
      return json(200, { application: c.application, release: c.release, files: c.files.map(({ debugId, path, kind }) => ({ debugId, path, kind })) })
    },
  })
  return {
    url: `http://localhost:${server.port}`,
    chunks, requests, commits, registered,
    script(route: "commit" | "chunks" | "missing", responses: Scripted[]) {
      scripted.set(route, [...(scripted.get(route) ?? []), ...responses])
    },
    loseChunkOnNextCommit(h: string) {
      loseOnCommit = h
    },
    fillStorage() {
      storageFull = true
    },
    reset() {
      requests.length = 0
      commits.length = 0
    },
    /** A fetch that sends https://obs.example.test and https://orgs.example.test to this fake. */
    fetch: ((input: string | URL | Request, init?: RequestInit) => {
      const u = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
      return fetch(u.replace(/^https:\/\/(?:obs|orgs)\.example\.test/, `http://localhost:${server.port}`), init)
    }) as typeof fetch,
    stop: () => server.stop(true),
  }
}
export type FakeObsApi = ReturnType<typeof fakeObsApi>
