// Debug-ID injection: CLI L2's algorithm (ezgh-cli internal/sourcemaps), ported byte for byte. The
// CLI owns the algorithm and its vectors (test/vectors/inject, synced by
// scripts/sync-inject-vectors.sh); this file must reproduce every vector's out.js exactly.
import { createHash } from "node:crypto"
import { InjectError } from "./errors.ts"
import { vlqDecode, vlqEncode } from "./vlq.ts"

export { InjectError }
export interface Injected { code: Buffer, map: Buffer, debugId: string, already: boolean }

/**
 * The registration code inserted into every JS file: one line, no newline. It registers the debug
 * ID under the Error stack of the code that runs it, so the SDK maps the script's URL (the stack's
 * first frame) to its debug ID. It never throws.
 */
export function snippet(id: string): string {
  return ";!function(){try{var g=\"undefined\"!=typeof globalThis?globalThis:\"undefined\"!=typeof self?self:"
    + "\"undefined\"!=typeof window?window:{},s=(new g.Error).stack;s&&((g._ezghDebugIds=g._ezghDebugIds||{})[s]=\""
    + id + "\")}catch(e){}}();"
}

/**
 * A file pair's debug ID, from its content: SHA-256 of "ezgh-debug-id\0" + js + "\0" + map, the
 * first 16 bytes with the RFC 9562 version (4) and variant bits, as a lowercase UUID.
 */
export function debugIdFor(js: Uint8Array, map: Uint8Array): string {
  const h = createHash("sha256").update("ezgh-debug-id\0").update(js).update("\0").update(map).digest()
  h[6] = (h[6]! & 0x0f) | 0x40
  h[8] = (h[8]! & 0x3f) | 0x80
  const x = h.subarray(0, 16).toString("hex")
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`
}

/**
 * Moves every mapping of generated line `line` at column >= `col` right by `delta`. Generated
 * columns are relative within a line, so only the first such segment's first field changes; every
 * other byte of `mappings` stays as it is.
 */
export function shiftColumns(mappings: string, line: number, col: number, delta: number): string {
  let start = 0
  for (let k = 0; k < line; k++) {
    const j = mappings.indexOf(";", start)
    if (j < 0) return mappings // no mappings on that line or after it
    start = j + 1
  }
  const semi = mappings.indexOf(";", start)
  const end = semi < 0 ? mappings.length : semi
  let abs = 0
  for (let seg = start; seg < end;) {
    const comma = mappings.indexOf(",", seg)
    const segEnd = comma >= 0 && comma < end ? comma : end
    if (seg === segEnd) { // an empty segment
      seg++
      continue
    }
    const { value, next } = vlqDecode(mappings, seg)
    if (next > segEnd) throw new InjectError("has malformed mappings")
    abs += value
    if (abs >= col) return mappings.slice(0, seg) + vlqEncode(value + delta) + mappings.slice(next)
    seg = segEnd + 1
  }
  return mappings
}

/**
 * Moves the mappings of generated line `line` at column >= `col` to a new line after it, their
 * columns less `col`. Only the first moved segment's generated column changes (the other fields
 * are relative across lines); a line with nothing at `col` or after gains an empty line.
 */
export function splitLine(mappings: string, line: number, col: number): string {
  let start = 0
  for (let k = 0; k < line; k++) {
    const j = mappings.indexOf(";", start)
    if (j < 0) return mappings // no mappings on that line or after it
    start = j + 1
  }
  const semi = mappings.indexOf(";", start)
  const end = semi < 0 ? mappings.length : semi
  let abs = 0
  for (let seg = start; seg < end;) {
    const comma = mappings.indexOf(",", seg)
    const segEnd = comma >= 0 && comma < end ? comma : end
    if (seg === segEnd) {
      seg++
      continue
    }
    const { value, next } = vlqDecode(mappings, seg)
    if (next > segEnd) throw new InjectError("has malformed mappings")
    abs += value
    if (abs >= col) return mappings.slice(0, seg > start ? seg - 1 : seg) + ";" + vlqEncode(abs - col) + mappings.slice(next)
    seg = segEnd + 1
  }
  return mappings.slice(0, end) + ";" + mappings.slice(end)
}

// The JS is matched as a byte string (latin1: one char per byte), as Go's regexp matches the
// file's bytes, so every byte (a BOM, invalid UTF-8) comes out as it went in. Every pattern is
// ASCII, and RE2's \s is [\t\n\f\r ] and its . excludes only \n: spelled out so JS matches Go.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const SNIPPET_ID = /\(g\._ezghDebugIds=g\._ezghDebugIds\|\|\{\}\)\[s\]="([0-9a-f-]{36})"/
// Go's (?m)^…\s*$: a line start is the start or after \n, a line end the end or before \n.
const COMMENT_ID = /(?<![^\n])\/\/# debugId=([0-9a-fA-F-]{36})[\t\n\f\r ]*(?![^\n])/g
// One directive of the prologue (and the whitespace and comments before it). A block comment
// can't contain */; "a".split(…) isn't a directive and doesn't match.
const DIRECTIVE = /^(?:[\t\n\f\r ]|\/\*[^*]*\*+(?:[^/*][^*]*\*+)*\/|\/\/[^\n]*\n)*(?:"(?:[^"\\\r\n]|\\[^\n])*"|'(?:[^'\\\r\n]|\\[^\n])*')[ \t]*(?:;|\r?\n|$)/
// The file's last line, when it's a sourceMappingURL comment (whitespace may follow).
const MAP_URL_LINE = /(^|\n)\/\/[#@] sourceMappingURL=[^\n]*[\t\n\f\r ]*$/
const BOM = "\xEF\xBB\xBF"

/** UTF-16 units of the UTF-8 bytes s[from, to) (a latin1 byte string), decoded as Go ranges a string: an invalid byte is one unit. */
function utf16Units(s: string, from: number, to: number): number {
  const b = (i: number) => (i < to ? s.charCodeAt(i) : -1)
  const cont = (i: number, lo = 0x80, hi = 0xbf) => b(i) >= lo && b(i) <= hi
  let n = 0
  for (let i = from; i < to;) {
    const c = b(i)
    if (c < 0x80) i += 1
    else if (c >= 0xc2 && c <= 0xdf && cont(i + 1)) i += 2
    else if (c >= 0xe0 && c <= 0xef && cont(i + 1, c === 0xe0 ? 0xa0 : 0x80, c === 0xed ? 0x9f : 0xbf) && cont(i + 2)) i += 3
    else if (c >= 0xf0 && c <= 0xf4 && cont(i + 1, c === 0xf0 ? 0x90 : 0x80, c === 0xf4 ? 0x8f : 0xbf) && cont(i + 2) && cont(i + 3)) {
      i += 4
      n += 1 // a supplementary character is a surrogate pair
    }
    else i += 1 // invalid: U+FFFD, one unit
    n += 1
  }
  return n
}

/**
 * Where the snippet goes: after a byte-order mark, a #! line and the whole directive prologue, so
 * "use strict" stays a directive. The byte offset, and the generated line and column (UTF-16
 * units, the BOM not counted) that source maps use.
 */
function insertionPoint(code: string): { at: number, line: number, column: number } {
  const start = code.startsWith(BOM) ? BOM.length : 0
  let at = start
  if (code.startsWith("#!", at)) {
    const nl = code.indexOf("\n", at)
    at = nl < 0 ? code.length : nl + 1
  }
  for (let m = DIRECTIVE.exec(code.slice(at)); m && m[0].length > 0; m = DIRECTIVE.exec(code.slice(at))) at += m[0].length
  let line = 0
  for (let i = code.indexOf("\n"); i >= 0 && i < at; i = code.indexOf("\n", i + 1)) line++
  let lineStart = at === 0 ? 0 : code.lastIndexOf("\n", at - 1) + 1
  if (lineStart === 0) lineStart = start
  return { at, line, column: utf16Units(code, lineStart, at) }
}

/**
 * Adds the debug ID to a JS file and its source map: the snippet after a BOM, a shebang line and
 * the directive prologue (with the map's columns shifted), a `//# debugId=` comment before a
 * trailing `sourceMappingURL` line (or at the end), and the map's `debugId`. `already` is true,
 * with the input unchanged, when all three are there and agree.
 */
export function injectDebugId(jsBytes: Buffer, mapBytes: Buffer): Injected {
  let map: unknown
  try {
    map = JSON.parse(mapBytes.toString("utf8"))
  }
  catch {
    throw new InjectError("isn't a JSON source map")
  }
  if (typeof map !== "object" || map === null || Array.isArray(map)) throw new InjectError("isn't a JSON source map")
  const m = map as Record<string, unknown>
  if ("sections" in m) throw new InjectError("is an index map (with sections), which inject doesn't support: build with a regular source map")
  if (m.version !== 3 || typeof m.mappings !== "string") throw new InjectError("isn't a version 3 source map with mappings")
  if ("debugId" in m && !(typeof m.debugId === "string" && UUID.test(m.debugId.toLowerCase()))) throw new InjectError("has a debugId that isn't a UUID")

  const js = jsBytes.toString("latin1")
  const fromSnippet = SNIPPET_ID.exec(js)?.[1]?.toLowerCase()
  const fromComment = [...js.matchAll(COMMENT_ID)].at(-1)?.[1]?.toLowerCase()
  const fromMap = typeof m.debugId === "string" ? m.debugId.toLowerCase() : undefined
  for (const x of [fromSnippet, fromComment]) if (x !== undefined && !UUID.test(x)) throw new InjectError(`has a debug ID that isn't a UUID (${x})`)
  const ids = [...new Set([fromSnippet, fromComment, fromMap].filter((x): x is string => x !== undefined))]
  if (ids.length > 1) throw new InjectError(`has two debug IDs (${ids[0]} and ${ids[1]}): rebuild it, then inject`)
  if (fromMap && !fromSnippet && !fromComment) throw new InjectError("has a source map with a debug ID but a JS file without one (an inject that didn't finish?): rebuild it, then inject")
  if (fromSnippet && fromComment && fromMap) return { code: Buffer.from(jsBytes), map: Buffer.from(mapBytes), debugId: fromSnippet, already: true }
  const id = ids[0] ?? debugIdFor(jsBytes, mapBytes)

  let code = js
  let mappings = m.mappings
  if (!fromSnippet) {
    const { at, line, column } = insertionPoint(code)
    const s = snippet(id)
    if (at === code.length && !code.includes("\n") && code.slice(code.startsWith(BOM) ? BOM.length : 0).startsWith("#!")) {
      // Only a #! line: the snippet goes on a line of its own, after every mapping.
      code += "\n" + s
    }
    else if (code.startsWith("//", at)) {
      // A line comment follows: the snippet ends its line, so the comment still starts a line.
      code = code.slice(0, at) + s + "\n" + code.slice(at)
      mappings = splitLine(mappings, line, column)
    }
    else {
      code = code.slice(0, at) + s + code.slice(at)
      mappings = shiftColumns(mappings, line, column, s.length)
    }
  }
  if (!fromComment) {
    const u = MAP_URL_LINE.exec(code)
    const comment = `//# debugId=${id}\n`
    if (u) {
      const i = u.index + u[1]!.length // after the newline that ends the previous line
      code = code.slice(0, i) + comment + code.slice(i)
    }
    else {
      code += (code.endsWith("\n") ? "" : "\n") + comment
    }
  }
  return { code: Buffer.from(code, "latin1"), map: Buffer.from(JSON.stringify({ ...m, debugId: id, mappings })), debugId: id, already: false }
}
