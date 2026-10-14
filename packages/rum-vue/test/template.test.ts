import { expect, test } from "bun:test"
import { vueTemplate } from "../src/template.ts"

test("the last matched record's pattern, else the core's path template", () => {
  expect(vueTemplate({ path: "/users/42", matched: [{ path: "/users" }, { path: "/users/:id" }] })).toBe("/users/:id")
  expect(vueTemplate({ path: "/x/y", matched: [{ path: "/:pathMatch(.*)*" }] })).toBe("/:pathMatch(.*)*")
  expect(vueTemplate({ path: "/orders/1234", matched: [] })).toBe("/orders/:id")
})
