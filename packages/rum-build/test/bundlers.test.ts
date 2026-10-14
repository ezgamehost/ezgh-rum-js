// Each bundler builds fixture-src (main.ts imports lazy.ts dynamically) with the plugin, uploading
// to the fake obs-api: every emitted JS file carries the snippet and the comment, every map its
// debugId, and the fake receives one commit with a js and a map for every ID. Rspack isn't a dev
// dependency, so it isn't built here.
import { afterAll, beforeEach, describe, expect, test } from "bun:test"
import { cpSync, existsSync, mkdirSync, mkdtempSync, symlinkSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ezghRumBuild, processOutput, type EzghRumBuildOptions } from "../src/index.ts"
import { snippet } from "../src/inject.ts"
import { fakeObsApi } from "./fake-obs-api.ts"

const api = fakeObsApi()
const work = mkdtempSync(join(tmpdir(), "ezgh-rum-build-"))
afterAll(() => {
  void api.stop()
  rmSync(work, { recursive: true, force: true })
})
beforeEach(() => api.reset())
const SRC = join(import.meta.dir, "fixture-src")
const ORG = "0b9f5e1c-3d2a-4c1e-9f00-1a2b3c4d5e6f", PRJ = "7c1d0000-0000-4000-8000-000000000001"
const logs: string[] = []
const options = (over: Partial<EzghRumBuildOptions> = {}): EzghRumBuildOptions => ({
  application: "fixture", release: "1.0.0", organizationId: ORG, projectId: PRJ, apiKey: "ezgh_ak_test",
  domain: "example.test", fetch: api.fetch, log: m => logs.push(m), ...over,
})
const fresh = (name: string) => {
  const d = join(work, name)
  rmSync(d, { recursive: true, force: true })
  cpSync(SRC, join(d, "src"), { recursive: true })
  return d
}
const jsFiles = (dir: string) => readdirSync(dir, { recursive: true }).map(String).filter(f => /\.m?js$/.test(f))

function assertInjected(out: string) {
  const js = jsFiles(out)
  expect(js.length).toBeGreaterThanOrEqual(2) // main and the lazy chunk
  const ids = new Set<string>()
  for (const f of js) {
    const code = readFileSync(join(out, f), "utf8")
    const id = /\/\/# debugId=([0-9a-f-]{36})\n(?:\/\/# sourceMappingURL=[^\n]*\n?)?$/.exec(code)?.[1]
    expect(id, f).toBeDefined()
    expect(code).toContain(snippet(id!))
    const map = JSON.parse(readFileSync(join(out, existsSync(join(out, `${f}.map`)) ? `${f}.map` : f.replace(/\.js$/, ".js.map")), "utf8")) as { debugId?: string }
    expect(map.debugId).toBe(id)
    ids.add(id!)
  }
  expect(api.commits).toHaveLength(1)
  const files = api.commits[0]!.files
  for (const id of ids) expect(files.filter(f => f.debugId === id).map(f => f.kind).sort()).toEqual(["js", "map"])
  expect(files).toHaveLength(ids.size * 2)
  return { ids, files }
}

describe("bundlers", () => {
  test("Vite", async () => {
    const { build } = await import("vite")
    const d = fresh("vite"), out = join(d, "dist")
    await build({
      root: d, configFile: false, logLevel: "silent", plugins: [ezghRumBuild.vite(options())],
      build: { outDir: out, sourcemap: "hidden", rollupOptions: { input: join(d, "src/main.ts") } },
    })
    assertInjected(out)
  }, 60_000)

  test("webpack", async () => {
    const { default: webpack } = await import("webpack")
    const d = fresh("webpack"), out = join(d, "dist")
    await new Promise<void>((resolve, reject) => {
      webpack({
        mode: "production", context: d, entry: "./src/main.ts", devtool: "hidden-source-map",
        output: { path: out, filename: "[name].js", chunkFilename: "[name].[contenthash].js" },
        plugins: [ezghRumBuild.webpack(options())],
      }, (err, stats) => {
        if (err || stats?.hasErrors()) reject(err ?? new Error(stats!.toString()))
        else resolve()
      })
    })
    assertInjected(out)
  }, 60_000)

  test("Rollup", async () => {
    const { rollup } = await import("rollup")
    const d = fresh("rollup"), out = join(d, "dist")
    const b = await rollup({ input: join(d, "src/main.ts"), plugins: [ezghRumBuild.rollup(options())] })
    await b.write({ dir: out, format: "es", sourcemap: true })
    await b.close()
    assertInjected(out)
  }, 60_000)

  test("esbuild", async () => {
    const { build } = await import("esbuild")
    const d = fresh("esbuild"), out = join(d, "dist")
    await build({
      entryPoints: [join(d, "src/main.ts")], bundle: true, outdir: out, sourcemap: "external", splitting: true,
      format: "esm", logLevel: "silent", plugins: [ezghRumBuild.esbuild(options())],
    })
    assertInjected(out)
  }, 60_000)
})

describe("processOutput", () => {
  function writeOut(dir: string, files: Record<string, string>) {
    for (const [f, c] of Object.entries(files)) writeFileSync(join(dir, f), c)
  }
  const MAP = (file: string) => JSON.stringify({ version: 3, file, sources: ["a.ts"], names: [], mappings: "AAAA" })

  test("without credentials it injects and logs one line; paths get the prefix; maps can be deleted", async () => {
    const d = mkdtempSync(join(work, "p-"))
    writeOut(d, { "a.js": "a()\n//# sourceMappingURL=a.js.map\n", "a.js.map": MAP("a.js"), "inline.js": "b()\n//# sourceMappingURL=data:application/json;base64,e30=\n", "nomap.js": "c()\n" })
    logs.length = 0
    expect(await processOutput(d, options({ apiKey: undefined, organizationId: undefined }))).toEqual({ injected: 1, uploaded: 0 })
    expect(logs.some(l => l.includes("debug IDs injected into 1 files; not uploading: set EZGH_API_KEY (or oidc), organizationId"))).toBe(true)
    expect(logs.some(l => l.includes("inline.js: its source map is inline (a data: URL)"))).toBe(true)
    expect(logs.some(l => l.includes("1 JS file(s) without a source map"))).toBe(true)
    // An already-injected build (the CLI did it) still uploads every pair.
    expect(await processOutput(d, options({ pathPrefix: "_next/static/", deleteMapsAfterUpload: true }))).toEqual({ injected: 0, uploaded: 2 })
    expect(api.commits[0]!.files.map(f => f.path).sort()).toEqual(["_next/static/a.js", "_next/static/a.js.map"])
    expect(existsSync(join(d, "a.js.map"))).toBe(false)
  })

  test("pairs as ezgh-cli's Find does: shared maps, outside or symlinked maps and absolute URLs are skipped", async () => {
    const d = mkdtempSync(join(work, "p-"))
    mkdirSync(join(d, "sub"))
    writeOut(d, {
      "one.js": "1\n//# sourceMappingURL=shared.map\n", "two.js": "2\n//# sourceMappingURL=shared.map\n", "shared.map": MAP("x"),
      "abs.js": "3\n//# sourceMappingURL=/abs.js.map\n", "abs.js.map": MAP("abs.js"),
      "up.js": "4\n//# sourceMappingURL=../up.js.map\n",
      "fallback.js": "5\n", "fallback.js.map": MAP("fallback.js"),
      "sub/rel.js": "6\n//# sourceMappingURL=../maps%20dir.map?v=1\n", "maps dir.map": MAP("rel.js"),
    })
    symlinkSync(join(d, "fallback.js.map"), join(d, "linked.js.map"))
    writeOut(d, { "linked.js": "7\n//# sourceMappingURL=linked.js.map\n" })
    logs.length = 0
    await processOutput(d, options({ upload: false }))
    const injected = ["fallback.js", "sub/rel.js"]
    for (const f of ["one.js", "two.js", "abs.js", "up.js", "linked.js"]) expect(readFileSync(join(d, f), "utf8")).not.toContain("debugId")
    for (const f of injected) expect(readFileSync(join(d, f), "utf8")).toContain("//# debugId=")
    expect(logs.some(l => l.includes("one.js: its source map shared.map is also two.js's"))).toBe(true)
  })

  test("only the pairs injected in this run upload when there are any; injection errors fail the build unless failOnError is false", async () => {
    const d = mkdtempSync(join(work, "p-"))
    writeOut(d, { "old.js": "o()\n", "old.js.map": MAP("old.js") })
    await processOutput(d, options({ upload: false }))
    writeOut(d, { "new.js": "n()\n", "new.js.map": MAP("new.js") })
    await processOutput(d, options())
    expect(api.commits[0]!.files.map(f => f.path).sort()).toEqual(["new.js", "new.js.map"])
    writeOut(d, { "bad.js": "x()\n", "bad.js.map": "{\"version\":3,\"sections\":[]}" })
    expect(await processOutput(d, options()).then(() => "resolved", (e: Error) => e.message)).toContain("bad.js is an index map")
    logs.length = 0
    expect(await processOutput(d, options({ failOnError: false }))).toEqual({ injected: 0, uploaded: 0 })
    expect(logs.join("\n")).toContain("bad.js is an index map")
  })
})
