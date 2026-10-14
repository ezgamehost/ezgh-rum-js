// Finds the JS files of a build's output and their source maps, on disk, after the bundler wrote
// them: one algorithm for every bundler, and the same as ezgh-cli's sourcemaps.Find:
// - walk the directory without following symlinks, skipping node_modules;
// - a JS file's map is the file its trailing //# sourceMappingURL= comment names (relative,
//   inside the directory, a regular file, not reached through a symlink), else <file>.map when
//   there's no comment; a data: URL, an absolute or outside URL, or no map skips the file;
// - a map named by two JS files pairs neither.
import { existsSync } from "node:fs"
import { lstat, readdir, readFile, realpath } from "node:fs/promises"
import { join, posix, relative, sep } from "node:path"

export interface Pair { js: string, map: string } // paths relative to the output directory, with "/"
interface Skipped { path: string, reason: string }

const isJS = (rel: string) => /\.(?:m|c)?js$/.test(rel)
const MAP_URL = /(?:^|\n)\/\/[#@] sourceMappingURL=([^\t\n\f\r ]*)[\t\n\f\r ]*$/

async function walk(root: string, rel: string, out: string[]): Promise<void> {
  for (const d of await readdir(join(root, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${d.name}` : d.name
    if (d.isDirectory()) {
      if (d.name !== "node_modules") await walk(root, r, out)
    }
    else if (d.isFile() && isJS(d.name)) out.push(r) // symlinks and other non-regular files are never followed
  }
}

async function isRegular(p: string): Promise<boolean> {
  try {
    return (await lstat(p)).isFile()
  }
  catch {
    return false
  }
}

async function inside(root: string, p: string): Promise<boolean> {
  try {
    const rel = relative(root, await realpath(p))
    return rel !== "" && !rel.startsWith("..") && !rel.split(sep).includes("..") && !/^[a-zA-Z]:/.test(rel) && !rel.startsWith(sep)
  }
  catch {
    return false
  }
}

async function mapFor(dir: string, rel: string): Promise<[string, ""] | [undefined, string]> {
  const text = await readFile(join(dir, rel), "latin1")
  const m = MAP_URL.exec(text)
  if (m) {
    const u = m[1]!
    if (u.toLowerCase().startsWith("data:")) return [undefined, "its source map is inline (a data: URL): build with external source maps"]
    if (u === "") return [undefined, "its sourceMappingURL comment is empty"]
    // Go's url.Parse: a scheme or host means not relative; the path is percent-decoded, without
    // the query and fragment.
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(u) || u.startsWith("//")) return [undefined, `its sourceMappingURL ${u} isn't a relative path`]
    let path = u.replace(/[?#].*$/s, "")
    try {
      path = decodeURIComponent(path)
    }
    catch {
      return [undefined, `its sourceMappingURL ${u} isn't a relative path`]
    }
    if (path.startsWith("/") || path.includes("\\")) return [undefined, `its sourceMappingURL ${u} isn't a relative path`]
    const target = posix.normalize(posix.join(posix.dirname(rel), path))
    if (target === ".." || target.startsWith("../")) return [undefined, `its source map ${u} is outside the directory`]
    const abs = join(dir, ...target.split("/"))
    if (!(await isRegular(abs))) return [undefined, `its source map ${target} isn't there`]
    if (!(await inside(dir, abs))) return [undefined, `its source map ${u} is outside the directory (through a symlink)`]
    return [target, ""]
  }
  if (await isRegular(join(dir, ...`${rel}.map`.split("/")))) return [`${rel}.map`, ""]
  return [undefined, "no source map"]
}

export async function findPairs(dir: string, include: ((rel: string) => boolean) | undefined, log: (m: string) => void): Promise<Pair[]> {
  if (!existsSync(dir)) return []
  const root = await realpath(dir) // the directory itself may be a symlink
  const files: string[] = []
  await walk(root, "", files)
  files.sort()
  let pairs: Pair[] = []
  const skipped: Skipped[] = []
  for (const rel of files) {
    if (include && !include(rel)) continue
    const [map, reason] = await mapFor(root, rel)
    if (map === undefined) skipped.push({ path: rel, reason })
    else pairs.push({ js: rel, map })
  }
  const users = new Map<string, string[]>()
  for (const p of pairs) users.set(p.map, [...(users.get(p.map) ?? []), p.js])
  pairs = pairs.filter((p) => {
    const js = users.get(p.map)!
    if (js.length < 2) return true
    skipped.push({ path: p.js, reason: `its source map ${p.map} is also ${js.filter(x => x !== p.js).join(", ")}'s: build with one map per file` })
    return false
  })
  const shown = skipped.filter(s => s.reason !== "no source map")
  for (const s of shown.slice(0, 20)) log(`ezgh-rum: skipped ${s.path}: ${s.reason}`)
  if (shown.length > 20) log(`ezgh-rum: skipped ${shown.length - 20} more file(s)`)
  const noMap = skipped.length - shown.length
  if (noMap > 0) log(`ezgh-rum: skipped ${noMap} JS file(s) without a source map`)
  return pairs
}
