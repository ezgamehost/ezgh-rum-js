// The chunked, content-addressed source-map upload through obs-api (spec "Source maps", plan 25
// interface corrections 2–4): chunks/missing, then the missing chunks, then commits of at most
// 1,000 files that never split a debug ID's js and map. obs-api never returns a storage URL, and
// nothing here builds or logs any URL but obs-api's.
import { createHash, randomUUID } from "node:crypto"

export const CHUNK_BYTES = 8 * 1024 * 1024
export const MISSING_BATCH = 1000
export const COMMIT_BATCH = 1000
const CONCURRENCY = 4
const ATTEMPTS = 4

export interface UploadFile { debugId: string, path: string, kind: "js" | "map", bytes: Uint8Array }
export interface UploadTarget {
  apiUrl: string
  organizationId: string
  projectId: string
  application: string
  release: string
  authorization: string
  fetch?: typeof fetch
  log?: (m: string) => void
}
interface ErrorBody { code?: string, message?: string, details?: { missing?: string[] }, missing?: string[], debugIds?: string[] }
export class UploadError extends Error {
  override name = "UploadError"
  constructor(message: string, readonly status: number, readonly code: string, readonly body: ErrorBody) {
    super(message)
  }
}

const sha256 = (b: Uint8Array): string => createHash("sha256").update(b).digest("hex")
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export async function upload(t: UploadTarget, files: readonly UploadFile[]): Promise<{ files: number, chunksUploaded: number }> {
  const f = t.fetch ?? fetch
  const base = `${t.apiUrl.replace(/\/+$/, "")}/v1/organizations/${t.organizationId}/projects/${t.projectId}/obs/source-maps`
  const chunkBytes = new Map<string, Uint8Array>()
  const entries = files.map((file) => {
    const chunks: string[] = []
    for (let o = 0; o < file.bytes.byteLength || o === 0; o += CHUNK_BYTES) {
      const part = file.bytes.subarray(o, o + CHUNK_BYTES)
      const h = sha256(part)
      chunks.push(h)
      chunkBytes.set(h, part)
    }
    // A file is (size, chunks): no whole-file hash (interface correction 4).
    return { debugId: file.debugId, path: file.path, kind: file.kind, size: file.bytes.byteLength, chunks }
  })

  async function call(path: string, init: RequestInit, attempt = 0): Promise<unknown> {
    let res: Response
    try {
      res = await f(base + path, { ...init, headers: { Authorization: t.authorization, ...(init.headers as Record<string, string>) } })
    }
    catch (e) {
      if (attempt + 1 >= ATTEMPTS) throw e
      await sleep(1000 * 2 ** attempt)
      return call(path, init, attempt + 1)
    }
    if (res.ok) return res.status === 204 ? undefined : res.json()
    const ra = Number(res.headers.get("Retry-After"))
    if ((res.status === 429 || res.status >= 500) && attempt + 1 < ATTEMPTS) {
      await res.body?.cancel().catch(() => undefined)
      await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra, 60) * 1000 : 1000 * 2 ** attempt)
      return call(path, init, attempt + 1)
    }
    // obs-api errors are { "error": { "code", "message", ...extra fields } }.
    const body = (await res.json().catch(() => ({})) as { error?: ErrorBody }).error ?? {}
    throw new UploadError(explain(res.status, body, res.statusText), res.status, body.code ?? "", body)
  }
  const json = (body: unknown, extra: Record<string, string> = {}): RequestInit =>
    ({ method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json", ...extra } })

  async function putChunks(hashes: readonly string[]): Promise<number> {
    const queue = [...new Set(hashes)].filter(h => chunkBytes.has(h))
    const n = queue.length
    await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
      for (let h = queue.shift(); h; h = queue.shift()) {
        await call("/chunks", { method: "POST", body: chunkBytes.get(h)! as Uint8Array<ArrayBuffer>, headers: { "Content-Type": "application/octet-stream", "x-ezgh-sha256": h } })
      }
    }))
    return n
  }

  let uploaded = 0
  const all = [...chunkBytes.keys()]
  for (let i = 0; i < all.length; i += MISSING_BATCH) {
    const { missing } = await call("/chunks/missing", json({ hashes: all.slice(i, i + MISSING_BATCH) })) as { missing: string[] }
    uploaded += await putChunks(missing)
  }
  // Pairs stay together: sort by debug ID and cut only between IDs.
  const sorted = [...entries].sort((a, b) => a.debugId.localeCompare(b.debugId) || a.kind.localeCompare(b.kind))
  for (let i = 0; i < sorted.length;) {
    let j = Math.min(i + COMMIT_BATCH, sorted.length)
    while (j < sorted.length && j > i + 1 && sorted[j]!.debugId === sorted[j - 1]!.debugId) j--
    const body = { application: t.application, release: t.release, files: sorted.slice(i, j) }
    try {
      await call("", json(body, { "Idempotency-Key": randomUUID() }))
    }
    catch (e) {
      const missing = e instanceof UploadError && e.status === 409 && e.code === "chunks_missing" ? e.body.details?.missing ?? e.body.missing : undefined
      if (!missing) throw e
      // A chunk went away between chunks/missing and the commit: upload it, then commit once more.
      uploaded += await putChunks(missing)
      await call("", json(body, { "Idempotency-Key": randomUUID() }))
    }
    t.log?.(`ezgh-rum: committed ${j - i} files for ${t.application}@${t.release}`)
    i = j
  }
  return { files: entries.length, chunksUploaded: uploaded }
}

function explain(status: number, e: ErrorBody, statusText: string): string {
  const code = e.code ?? ""
  const message = e.message ?? statusText
  if (status === 401 || status === 403) return "the key can't upload source maps: give its owner the ObsSourceMapUpload policy"
  if (code === "debug_id_conflict") {
    const ids = e.debugIds?.length ? e.debugIds.join(", ") : message
    return `debug ID ${ids} is already registered with different content: rebuild, then upload`
  }
  if (code === "storage_limit_exceeded") return "the project's 10 GiB source-map storage is full: delete old releases (ezgh obs sourcemaps delete)"
  return `obs-api answered ${status} ${code}: ${message}`
}
