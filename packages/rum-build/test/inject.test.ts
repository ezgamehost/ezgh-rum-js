import { describe, expect, test } from "bun:test"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { debugIdFor, injectDebugId, shiftColumns } from "../src/inject.ts"

const VECTORS = join(import.meta.dir, "vectors/inject")
describe("CLI L2 vectors, byte for byte", () => {
  test("CLI_REV is recorded", () => {
    expect(existsSync(join(import.meta.dir, "vectors/CLI_REV"))).toBe(true)
  })
  for (const name of existsSync(VECTORS) ? readdirSync(VECTORS) : []) {
    test(name, () => {
      const d = join(VECTORS, name), read = (f: string) => readFileSync(join(d, f))
      const run = () => injectDebugId(read("in.js"), read("in.js.map"))
      if (existsSync(join(d, "error.txt"))) {
        expect(run).toThrow(read("error.txt").toString().trim())
        return
      }
      const out = run()
      expect(out.code.toString()).toBe(read("out.js").toString())
      expect(JSON.parse(out.map.toString())).toEqual(JSON.parse(read("out.js.map").toString()))
      const again = injectDebugId(out.code, out.map)
      expect(again.already).toBe(true)
      expect(again.debugId).toBe(out.debugId)
    })
  }
})
test("debugIdFor is a stable UUIDv4 (the CLI's test input)", () => {
  const id = debugIdFor(Buffer.from("console.log(1)\n"), Buffer.from("{\"version\":3,\"mappings\":\"AAAA\"}"))
  expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  expect(debugIdFor(Buffer.from("console.log(1)\n"), Buffer.from("{\"version\":3,\"mappings\":\"AAAA\"}"))).toBe(id)
})
test("shiftColumns (the CLI's cases)", () => {
  expect(shiftColumns("AAAA,CAAC;AACA", 0, 0, 10)).toBe("UAAA,CAAC;AACA")
  expect(shiftColumns("AAAA,UAAU;AACA", 0, 5, 3)).toBe("AAAA,aAAU;AACA")
  expect(shiftColumns("AAAA;;AAEA", 1, 0, 7)).toBe("AAAA;;AAEA")
  expect(shiftColumns("AAAA;AACA", 1, 0, 2)).toBe("AAAA;EACA")
})
test("refuses maps that aren't v3, malformed mappings and non-UUID debugIds", () => {
  const js = Buffer.from("x()\n")
  expect(() => injectDebugId(js, Buffer.from("nope"))).toThrow("isn't a JSON source map")
  expect(() => injectDebugId(js, Buffer.from("{\"version\":2,\"mappings\":\"\"}"))).toThrow("isn't a version 3 source map")
  expect(() => injectDebugId(js, Buffer.from("{\"version\":3,\"mappings\":\"AAAA\",\"debugId\":\"x\"}"))).toThrow("has a debugId that isn't a UUID")
  expect(() => injectDebugId(js, Buffer.from("{\"version\":3,\"mappings\":\"!AAA\"}"))).toThrow("has malformed mappings")
})
test("a string that isn't a directive isn't skipped; a BOM isn't counted in the column", () => {
  const notDirective = injectDebugId(Buffer.from("\"a\".split(\"\")\n"), Buffer.from("{\"version\":3,\"mappings\":\"AAAA\"}"))
  expect(notDirective.code.toString().startsWith(";!function(){")).toBe(true)
  const bom = injectDebugId(Buffer.from("﻿\"use strict\";f()\n"), Buffer.from("{\"version\":3,\"mappings\":\"cAAA\"}"))
  expect(bom.code.toString().startsWith("﻿\"use strict\";;!function(){")).toBe(true)
  const s = bom.code.toString().indexOf("}();") + 4 - 1 // the snippet's length
  expect((JSON.parse(bom.map.toString()) as { mappings: string }).mappings).not.toBe("cAAA")
  expect(s).toBeGreaterThan(0)
})
test("bytes are kept as they are: invalid UTF-8 survives and counts one column per byte, as in Go", () => {
  const js = Buffer.concat([Buffer.from([0x22, 0xff, 0x22, 0x3b]), Buffer.from("f()\n")]) // "\xff";f()
  const out = injectDebugId(js, Buffer.from("{\"version\":3,\"mappings\":\"IAAA\"}"))
  expect(out.code.subarray(0, 4)).toEqual(js.subarray(0, 4))
  expect(out.code.subarray(4, 6).toString()).toBe(";!")
  const s = ";!function(){try{var g=\"undefined\"!=typeof globalThis?globalThis:\"undefined\"!=typeof self?self:\"undefined\"!=typeof window?window:{},s=(new g.Error).stack;s&&((g._ezghDebugIds=g._ezghDebugIds||{})[s]=\"".length + 36 + "\")}catch(e){}}();".length
  const first = (JSON.parse(out.map.toString()) as { mappings: string }).mappings.split(",")[0]!
  expect(first).toBe(shiftColumns("IAAA", 0, 4, s))
  expect(first).not.toBe("IAAA")
})
