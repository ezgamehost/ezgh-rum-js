import { expect, test } from "bun:test"
import { templateFromParams, templatePath } from "../src/route.ts"

test("templatePath replaces digits, UUIDs and 8+ hex with :id and caps at 128", () => {
  expect(templatePath("/users/42/orders/0b9f5e1c-3d2a-4c1e-9f00-1a2b3c4d5e6f")).toBe("/users/:id/orders/:id")
  expect(templatePath("/blob/deadbeef01/raw")).toBe("/blob/:id/raw")
  expect(templatePath("/about/team")).toBe("/about/team")
  expect(templatePath("/abc1234")).toBe("/abc1234") // 7 chars: kept
  expect(templatePath("")).toBe("/")
  // "a" × 300 (the plan's text) is hex, so it becomes :id; "z" isn't
  expect(templatePath("/" + "z".repeat(300))).toHaveLength(128)
})
test("templateFromParams names dynamic segments, catch-alls collapse", () => {
  expect(templateFromParams("/users/42/posts/hello", { id: "42", slug: "hello" })).toBe("/users/:id/posts/:slug")
  expect(templateFromParams("/docs/a/b/c", { path: ["a", "b", "c"] })).toBe("/docs/:path*")
  expect(templateFromParams("/blog/2024", {})).toBe("/blog/2024") // static digits stay
  expect(templateFromParams("/t/a%20b", { tag: "a b" })).toBe("/t/:tag")
})
