import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { resolveAuthorization } from "../src/auth.ts"
import { CHUNK_BYTES, upload, type UploadFile, type UploadTarget } from "../src/upload.ts"
import { fakeObsApi } from "./fake-obs-api.ts"

const api = fakeObsApi()
afterAll(() => api.stop())
const ORG = "0b9f5e1c-3d2a-4c1e-9f00-1a2b3c4d5e6f", PRJ = "7c1d0000-0000-4000-8000-000000000001"
const logs: string[] = []
const target = (over: Partial<UploadTarget> = {}): UploadTarget => ({
  apiUrl: api.url, organizationId: ORG, projectId: PRJ, application: "storefront", release: "2026.10.13",
  authorization: "Bearer ezgh_ak_test", log: m => logs.push(m), ...over,
})
const rejection = (p: Promise<unknown>) => p.then(() => "resolved", (e: Error) => e.message)
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex")
let n = 0
const id = () => `8a3c0000-0000-4000-8000-${String(++n).padStart(12, "0")}`
function pair(debugId = id(), size = 64): UploadFile[] {
  const fill = (k: string) => new Uint8Array(Buffer.from(`${debugId}:${k}:`.padEnd(size, "x")))
  return [{ debugId, path: `assets/${debugId}.js`, kind: "js", bytes: fill("js") }, { debugId, path: `assets/${debugId}.js.map`, kind: "map", bytes: fill("map") }]
}
const chunkPosts = () => api.requests.filter(r => r.path.endsWith("/source-maps/chunks"))
const commitPosts = () => api.requests.filter(r => r.path.endsWith("/obs/source-maps"))
beforeEach(() => {
  api.reset()
  logs.length = 0
})

describe("upload", () => {
  test("a 20 MiB map is chunked 8, 8 and 4 MiB, in order; a second upload sends no chunk bodies", async () => {
    const big = new Uint8Array(20 * 1024 * 1024)
    for (let i = 0; i < big.length; i += 4096) big[i] = (i / 4096) % 251
    const debugId = id()
    const files: UploadFile[] = [{ debugId, path: "assets/big.js", kind: "js", bytes: new Uint8Array(Buffer.from("big()")) },
      { debugId, path: "assets/big.js.map", kind: "map", bytes: big }]
    const r = await upload(target(), files)
    expect(r).toEqual({ files: 2, chunksUploaded: 4 })
    const map = api.commits[0]!.files.find(f => f.kind === "map")!
    expect(map.size).toBe(big.byteLength)
    expect(map.chunks).toEqual([sha(big.subarray(0, CHUNK_BYTES)), sha(big.subarray(CHUNK_BYTES, 2 * CHUNK_BYTES)), sha(big.subarray(2 * CHUNK_BYTES))])
    expect(chunkPosts().map(c => c.body.byteLength).sort((a, b) => b - a)).toEqual([CHUNK_BYTES, CHUNK_BYTES, 4 * 1024 * 1024, 5])
    for (const c of chunkPosts()) expect(c.headers["x-ezgh-sha256"]).toBe(sha(c.body))
    expect(map).not.toHaveProperty("sha256")

    api.reset()
    expect(await upload(target(), files)).toEqual({ files: 2, chunksUploaded: 0 })
    expect(chunkPosts()).toHaveLength(0)
    expect(api.requests.map(q => q.path.replace(/.*\/source-maps/, ""))).toEqual(["/chunks/missing", ""])
  })

  test("1,500 files take two commits and no debug ID's pair is split", async () => {
    const files = Array.from({ length: 750 }, () => pair()).flat()
    await upload(target(), files)
    expect(api.commits).toHaveLength(2)
    expect(api.commits.map(c => c.files.length).reduce((a, b) => a + b)).toBe(1500)
    for (const c of api.commits) {
      expect(c.files.length).toBeLessThanOrEqual(1000)
      const ids = new Map<string, number>()
      for (const f of c.files) ids.set(f.debugId, (ids.get(f.debugId) ?? 0) + 1)
      for (const k of ids.values()) expect(k).toBe(2)
    }
    expect(api.requests.filter(r => r.path.endsWith("/chunks/missing"))).toHaveLength(2)
    for (const c of commitPosts()) expect(c.headers["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/)
  })

  test("a 429 with Retry-After: 1 is retried after at least a second", async () => {
    api.script("commit", [{ status: 429, retryAfter: 1 }])
    const t0 = performance.now()
    await upload(target(), pair())
    expect(performance.now() - t0).toBeGreaterThanOrEqual(990)
    expect(commitPosts()).toHaveLength(2)
    expect(api.commits).toHaveLength(1)
  })

  test("409 chunks_missing uploads the missing chunks and retries the commit once", async () => {
    const files = pair()
    api.loseChunkOnNextCommit(sha(files[1]!.bytes))
    const r = await upload(target(), files)
    expect(r.chunksUploaded).toBe(3)
    expect(commitPosts()).toHaveLength(2)
    expect(api.commits).toHaveLength(1)
    // A second chunks_missing fails.
    const again = pair()
    api.script("commit", [{ status: 409, error: { code: "chunks_missing", details: { missing: [sha(again[0]!.bytes)] } } },
      { status: 409, error: { code: "chunks_missing", details: { missing: [sha(again[0]!.bytes)] } } }])
    expect(await rejection(upload(target(), again))).toContain("409 chunks_missing")
  })

  test("debug_id_conflict names the debug ID; storage_limit_exceeded names the 10 GiB cap", async () => {
    const [js, map] = pair()
    await upload(target(), [js!, map!])
    const changed: UploadFile = { ...map!, bytes: new Uint8Array(Buffer.from("other content")) }
    expect(await rejection(upload(target(), [js!, changed]))).toContain(`debug ID ${js!.debugId} is already registered`)
    const api2 = fakeObsApi()
    api2.fillStorage()
    expect(await rejection(upload(target({ apiUrl: api2.url }), pair()))).toContain("10 GiB")
    void api2.stop()
  })

  test("401 and 403 name the policy", async () => {
    expect(await rejection(upload(target({ authorization: "Bearer denied" }), pair()))).toContain("the key can't upload source maps: give its owner the ObsSourceMapUpload policy")
    expect(await rejection(upload(target({ authorization: "Basic x" }), pair()))).toContain("ObsSourceMapUpload policy")
  })

  test("no request goes anywhere but obs-api, and no body or log line carries another URL", async () => {
    await upload(target(), pair())
    for (const r of api.requests) {
      expect(r.path.startsWith(`/v1/organizations/${ORG}/projects/${PRJ}/obs/source-maps`)).toBe(true)
      expect(new TextDecoder().decode(r.body)).not.toMatch(/https?:\/\//)
    }
    expect(logs.join("\n")).not.toMatch(/https?:\/\//)
    expect(logs).toEqual([`ezgh-rum: committed 2 files for storefront@2026.10.13`])
  })
})

describe("resolveAuthorization", () => {
  test("an API key wins; the env key next; nothing without either or OIDC", async () => {
    expect(await resolveAuthorization({ apiKey: "k1", organizationId: ORG, domain: "example.test" }, { EZGH_API_KEY: "k2" })).toBe("Bearer k1")
    expect(await resolveAuthorization({ organizationId: ORG, domain: "example.test" }, { EZGH_API_KEY: "k2" })).toBe("Bearer k2")
    expect(await resolveAuthorization({ organizationId: ORG, domain: "example.test" }, {})).toBeUndefined()
  })
  test("GitHub OIDC: the ID token is exchanged at org-api with no Authorization header", async () => {
    const env = { ACTIONS_ID_TOKEN_REQUEST_URL: `${api.url}/gh-token?api-version=2.0`, ACTIONS_ID_TOKEN_REQUEST_TOKEN: "req-token" }
    const auth = await resolveAuthorization({ oidc: { bot: "bot_deploy" }, organizationId: ORG, domain: "example.test", fetch: api.fetch }, env)
    expect(auth).toBe("Bearer ezgh_ak_from_oidc")
    const [gh, ex] = api.requests
    expect(gh!.path).toBe("/gh-token?api-version=2.0&audience=example.test")
    expect(gh!.headers.authorization).toBe("Bearer req-token")
    expect(ex!.path).toBe(`/v1/organizations/${ORG}/bots/bot_deploy/oidc-api-keys`)
    expect(ex!.headers.authorization).toBeUndefined()
    expect(JSON.parse(new TextDecoder().decode(ex!.body))).toEqual({ token: "gh-id-token", name: "ezgh-rum-build", expiresInSeconds: 900 })
  })
})
