import { expect, test } from "bun:test"
import { Guard } from "../src/guard.ts"

test("swallows errors, disables after 10, and never throws", () => {
  let disabled = 0
  const g = new Guard(() => {
    disabled++
  })
  const boom = g.wrap(() => {
    throw new Error("x")
  })
  for (let i = 0; i < 12; i++) boom()
  expect(disabled).toBe(1)
  expect(g.disabled).toBe(true)
  expect(g.run(() => 1)).toBeUndefined()
})
