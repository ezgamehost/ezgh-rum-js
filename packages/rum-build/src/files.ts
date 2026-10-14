// Finds the JS files of a build's output and their source maps, on disk, after the bundler wrote
// them: one algorithm for every bundler.
import { existsSync } from "node:fs"
import { readdir, readFile } from "node:fs/promises"
import { dirname, join, normalize, relative, sep } from "node:path"

export interface Pair { js: string, map: string } // paths relative to the output directory, with "/"

const DEFAULT_INCLUDE = (rel: string) => /\.(?:m|c)?js$/.test(rel) && !/(?:^|\/)node_modules\//.test(rel)
const MAP_URL = /(?:^|\n)\/\/[#@] sourceMappingURL=([^\s]*)[\t\n\f\r ]*$/
const INLINE = Symbol("inline")
const toPosix = (p: string) => p.split(sep).join("/")

export async function findPairs(dir: string, include: ((rel: string) => boolean) | undefined, log: (m: string) => void): Promise<Pair[]> {
  if (!existsSync(dir)) return []
  const keep = include ?? DEFAULT_INCLUDE
  const all = (await readdir(dir, { recursive: true, withFileTypes: true }))
    .filter(d => d.isFile())
    .map(d => toPosix(relative(dir, join(d.parentPath, d.name))))
    .sort()
  const pairs: Pair[] = []
  let noMap = 0, inline = 0
  for (const rel of all) {
    if (!keep(rel)) continue
    const map = await mapOf(dir, rel)
    if (map === INLINE) inline++
    else if (map === undefined) noMap++
    else pairs.push({ js: rel, map })
  }
  if (inline > 0) log(`ezgh-rum: skipped ${inline} file(s) with inline (data:) source maps: build with external or hidden source maps`)
  if (noMap > 0) log(`ezgh-rum: skipped ${noMap} JS file(s) without a source map`)
  return pairs
}

async function mapOf(dir: string, rel: string): Promise<string | typeof INLINE | undefined> {
  const text = await readFile(join(dir, rel), "utf8")
  const url = MAP_URL.exec(text)?.[1]
  if (url?.startsWith("data:")) return INLINE
  if (url && !/^[a-z][a-z0-9+.-]*:/i.test(url) && !url.startsWith("/")) {
    let decoded = url.replace(/[?#].*$/, "")
    try {
      decoded = decodeURIComponent(decoded)
    }
    catch { /* keep it as written */ }
    const target = toPosix(normalize(join(dirname(rel), decoded)))
    if (!target.startsWith("../") && existsSync(join(dir, target))) return target
  }
  return existsSync(join(dir, `${rel}.map`)) ? `${rel}.map` : undefined
}
