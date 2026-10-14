// What every bundler hook runs once the bundler wrote its files: inject debug IDs into the output
// on disk, then upload the injected pairs through obs-api.
import { readFile, unlink, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { resolveAuthorization, type OidcOptions } from "./auth.ts"
import { InjectError } from "./errors.ts"
import { findPairs } from "./files.ts"
import { injectDebugId } from "./inject.ts"
import { upload, type UploadFile } from "./upload.ts"

export interface EzghRumBuildOptions {
  /** Default env EZGH_RUM_APPLICATION; required to upload. */
  application?: string
  /** Default env EZGH_RUM_RELEASE; required to upload. */
  release?: string
  /** The organization's UUID; default env EZGH_ORGANIZATION_ID. */
  organizationId?: string
  /** The project's UUID; default env EZGH_PROJECT_ID. */
  projectId?: string
  /** Default env EZGH_API_KEY (setup-ezgh sets it from OIDC). */
  apiKey?: string
  /** GitHub Actions OIDC → a short-lived bot key, when there's no API key. */
  oidc?: OidcOptions
  /** Default env EZGH_DOMAIN, else "ezghcloud.com"; uploads go to https://obs.<domain>. */
  domain?: string
  /** Default true; false only injects. */
  upload?: boolean
  /** Default true: an error fails the build. False logs it instead. */
  failOnError?: boolean
  /** Default false (withEzghRum: true): delete the uploaded .map files from the output. */
  deleteMapsAfterUpload?: boolean
  /** Default: .js, .mjs and .cjs files outside node_modules. */
  include?: (relPath: string) => boolean
  /** Prefixed to committed paths (withEzghRum: "_next/static/"). */
  pathPrefix?: string
  /** @internal For tests: the fetch used for obs-api and org-api. */
  fetch?: typeof fetch
  /** @internal For tests: where log lines go (default console.log). */
  log?: (m: string) => void
}

export async function processOutput(dir: string, o: EzghRumBuildOptions = {}): Promise<{ injected: number, uploaded: number }> {
  const log = o.log ?? ((m: string) => console.log(m))
  try {
    return await run(dir, o, log)
  }
  catch (e) {
    if (o.failOnError ?? true) throw e
    log(`ezgh-rum: ${e instanceof Error ? e.message : String(e)}`)
    return { injected: 0, uploaded: 0 }
  }
}

async function run(dir: string, o: EzghRumBuildOptions, log: (m: string) => void): Promise<{ injected: number, uploaded: number }> {
  const env = process.env
  const pairs = await findPairs(dir, o.include, log)
  const fresh: UploadFile[] = [], all: UploadFile[] = []
  let injected = 0
  for (const p of pairs) {
    const jsPath = join(dir, p.js), mapPath = join(dir, p.map)
    const [js, map] = await Promise.all([readFile(jsPath), readFile(mapPath)])
    let out
    try {
      out = injectDebugId(js, map)
    }
    catch (e) {
      if (e instanceof InjectError) throw new Error(`ezgh-rum: ${p.js} ${e.message}`, { cause: e })
      throw e
    }
    if (!out.already) {
      if (!out.code.equals(js)) await writeFile(jsPath, out.code)
      if (!out.map.equals(map)) await writeFile(mapPath, out.map)
      injected++
    }
    const prefix = o.pathPrefix ?? ""
    const files: UploadFile[] = [
      { debugId: out.debugId, path: prefix + p.js, kind: "js", bytes: out.code },
      { debugId: out.debugId, path: prefix + p.map, kind: "map", bytes: out.map },
    ]
    all.push(...files)
    if (!out.already) fresh.push(...files)
  }
  // The pairs injected in this run, or, when none were (a CLI-injected build), every pair with a
  // debug ID: leftovers of an older build in a non-emptied outDir aren't committed in this release.
  const set = fresh.length > 0 ? fresh : all
  if (o.upload === false || set.length === 0) {
    if (injected > 0) log(`ezgh-rum: debug IDs injected into ${injected} files`)
    return { injected, uploaded: 0 }
  }
  const application = o.application ?? env.EZGH_RUM_APPLICATION
  const release = o.release ?? env.EZGH_RUM_RELEASE
  const organizationId = o.organizationId ?? env.EZGH_ORGANIZATION_ID
  const projectId = o.projectId ?? env.EZGH_PROJECT_ID
  const domain = o.domain ?? env.EZGH_DOMAIN ?? "ezghcloud.com"
  const authorization = organizationId
    ? await resolveAuthorization({ apiKey: o.apiKey, oidc: o.oidc, organizationId, domain, fetch: o.fetch }, env)
    : undefined
  const unset = [
    !authorization && "EZGH_API_KEY (or oidc)", !organizationId && "organizationId (EZGH_ORGANIZATION_ID)",
    !projectId && "projectId (EZGH_PROJECT_ID)", !application && "application", !release && "release",
  ].filter(Boolean)
  if (unset.length > 0) {
    log(`ezgh-rum: debug IDs injected into ${injected} files; not uploading: set ${unset.join(", ")}`)
    return { injected, uploaded: 0 }
  }
  const r = await upload({
    apiUrl: `https://obs.${domain}`, organizationId: organizationId!, projectId: projectId!, application: application!,
    release: release!, authorization: authorization!, fetch: o.fetch, log,
  }, set)
  if (o.deleteMapsAfterUpload) {
    await Promise.all(set.filter(f => f.kind === "map").map(f => unlink(join(dir, f.path.slice((o.pathPrefix ?? "").length))).catch(() => undefined)))
  }
  return { injected, uploaded: r.files }
}
