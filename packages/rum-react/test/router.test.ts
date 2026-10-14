import { expect, test } from "bun:test"
import { routeTemplate } from "../src/router.ts"

const m = (...paths: Array<string | undefined>) => paths.map(path => ({ route: path === undefined ? {} : { path } }))

test("joins the matched routes' paths", () => {
  expect(routeTemplate(m("/", "users", ":id"))).toBe("/users/:id")
  expect(routeTemplate(m("/", "users", undefined))).toBe("/users") // index route adds nothing
  expect(routeTemplate(m("/", "docs", "*"))).toBe("/docs/*")
  expect(routeTemplate(m("/", "/settings", "profile"))).toBe("/settings/profile") // absolute child isn't joined twice
  expect(routeTemplate(m("/app", "/app/users/:id"))).toBe("/app/users/:id")
  expect(routeTemplate([])).toBe("/")
  expect(routeTemplate(m("/", ""))).toBe("/")
})
