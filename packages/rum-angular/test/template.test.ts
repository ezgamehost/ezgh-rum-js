import { expect, test } from "bun:test"
import { angularTemplate } from "../src/template.ts"

test("joins routeConfig.path along the primary chain, skipping empty segments", () => {
  expect(angularTemplate({ routeConfig: null, firstChild: { routeConfig: { path: "" }, firstChild: { routeConfig: { path: "users" }, firstChild: { routeConfig: { path: ":id" } } } } })).toBe("/users/:id")
  expect(angularTemplate({ routeConfig: null })).toBe("/")
  expect(angularTemplate({ routeConfig: null, firstChild: { routeConfig: { path: "docs/**" } } })).toBe("/docs/**")
})
