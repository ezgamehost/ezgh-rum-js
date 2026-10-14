import { expect, test } from "bun:test"
import { clsOf, inpOf } from "../src/vitals.ts"

test("CLS: largest session window (1 s gap, 5 s cap), ignoring shifts after input", () => {
  expect(clsOf([{ value: 0.1, startTime: 0, hadRecentInput: false }, { value: 0.1, startTime: 500, hadRecentInput: false },
    { value: 0.3, startTime: 2000, hadRecentInput: false }, { value: 0.05, startTime: 2100, hadRecentInput: false },
    { value: 9, startTime: 2200, hadRecentInput: true }])).toBeCloseTo(0.35)
  const every900 = Array.from({ length: 8 }, (_, i) => ({ value: 0.1, startTime: i * 900, hadRecentInput: false }))
  expect(clsOf(every900)).toBeCloseTo(0.6) // 0..4500 is one window; 5400 starts the next
  expect(clsOf([])).toBe(0)
})
test("INP: worst for <50 interactions, then skips one per 50", () => {
  expect(inpOf([])).toBeUndefined()
  expect(inpOf([40, 100, 72])).toBe(100)
  expect(inpOf(Array.from({ length: 120 }, (_, i) => i + 1))).toBe(118)
})
