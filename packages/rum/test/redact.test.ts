import { expect, test } from "bun:test"
import { makeRedactor } from "../src/redact.ts"

test("redacts default and extra parameters case-insensitively, drops fragments and userinfo", () => {
  const r = makeRedactor(["Coupon"])
  expect(r("https://u:p@shop.example.com/cart?id=7&Token=abc&coupon=X1&q=a b#frag")).toEqual({
    full: "https://shop.example.com/cart?id=7&Token=REDACTED&coupon=REDACTED&q=a%20b",
    path: "/cart", query: "id=7&Token=REDACTED&coupon=REDACTED&q=a%20b",
  })
})
test("relative URLs resolve against the base; non-http schemes keep only the scheme", () => {
  const r = makeRedactor([])
  expect(r("/api/items?code=1", "https://a.example/x").full).toBe("https://a.example/api/items?code=REDACTED")
  expect(r("data:text/plain,secret").full).toBe("data:")
  expect(r("::not a url").full).toBe("")
})
test("no query gives no question mark", () => {
  expect(makeRedactor([])("https://a.example/p").full).toBe("https://a.example/p")
})
