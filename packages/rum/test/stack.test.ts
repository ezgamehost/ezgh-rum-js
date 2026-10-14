import { expect, test } from "bun:test"
import { debugIdsFor, stackUrls, topFrame } from "../src/stack.ts"

const CHROME = "TypeError: x\n    at explode (https://shop.example.com/assets/index-4f2a.js:1:2050)\n    at https://shop.example.com/assets/vendor-91ab.js:2:10\n    at https://shop.example.com/assets/index-4f2a.js:1:99"
const FIREFOX = "explode@https://shop.example.com/assets/index-4f2a.js:1:2050\n@https://shop.example.com/assets/vendor-91ab.js?v=2:2:10\n"
const SAFARI = "explode@https://shop.example.com:8443/assets/index-4f2a.js:1:2050\nglobal code@blob:https://shop.example.com/0b9f5e1c:3:4"

test("script URLs, unique, in stack order, for the three engines", () => {
  expect(stackUrls(CHROME)).toEqual(["https://shop.example.com/assets/index-4f2a.js", "https://shop.example.com/assets/vendor-91ab.js"])
  expect(stackUrls(FIREFOX)).toEqual(["https://shop.example.com/assets/index-4f2a.js", "https://shop.example.com/assets/vendor-91ab.js?v=2"])
  expect(stackUrls(SAFARI)).toEqual(["https://shop.example.com:8443/assets/index-4f2a.js", "blob:https://shop.example.com/0b9f5e1c"])
  expect(stackUrls("Error\n    at http://localhost:4173/assets/index-B1.js:9:7")).toEqual(["http://localhost:4173/assets/index-B1.js"])
})
test("the registry is keyed by the snippet's stack; its first frame names the script", () => {
  // What CLI L2's snippet stores: g._ezghDebugIds[(new g.Error).stack] = id, per engine.
  const reg = {
    "Error\n    at https://shop.example.com/assets/index-4f2a.js:1:31\n    at https://shop.example.com/assets/index-4f2a.js:1:240": "8a3c0000-0000-4000-8000-000000000001",
    "@https://shop.example.com/assets/vendor-91ab.js?v=2:1:31\n": "8a3c0000-0000-4000-8000-000000000002",
  }
  expect(debugIdsFor(CHROME, reg)).toEqual({ "https://shop.example.com/assets/index-4f2a.js": "8a3c0000-0000-4000-8000-000000000001" })
  expect(debugIdsFor(FIREFOX, reg)).toEqual({
    "https://shop.example.com/assets/index-4f2a.js": "8a3c0000-0000-4000-8000-000000000001",
    "https://shop.example.com/assets/vendor-91ab.js?v=2": "8a3c0000-0000-4000-8000-000000000002",
  })
  expect(debugIdsFor(CHROME, undefined)).toEqual({})
  expect(topFrame(CHROME)).toBe("at explode (https://shop.example.com/assets/index-4f2a.js:1:2050)")
})
