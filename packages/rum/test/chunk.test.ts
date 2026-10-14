import { expect, test } from "bun:test"
import { chunkItems, item, utf8Length } from "../src/chunk.ts"
import { RecordQueue } from "../src/queue.ts"

test("utf8Length counts bytes", () => {
  expect(utf8Length("aé€😀")).toBe(1 + 2 + 3 + 4)
  expect(utf8Length("\ud800x")).toBe(3 + 1) // a lone surrogate encodes as U+FFFD
})
test("chunks per signal, in order, under the limit including envelope and commas", () => {
  const items = [item("logs", "x".repeat(400)), item("traces", "y".repeat(400)), item("logs", "z".repeat(400)), item("logs", "w".repeat(5000))]
  const { chunks, oversized } = chunkItems(items, 1000, () => 100)
  expect(chunks.map(c => [c.signal, c.items.length])).toEqual([["logs", 2], ["traces", 1]])
  expect(oversized).toHaveLength(1)
  for (const c of chunks) expect(100 + c.items.reduce((n, i) => n + i.bytes + 1, 0)).toBeLessThanOrEqual(1000)
})
test("the queue keeps at most 1 MB, dropping the oldest", () => {
  const q = new RecordQueue()
  for (let i = 0; i < 30; i++) q.push(item("logs", String(i).padEnd(50_000)))
  expect(q.bytes).toBeLessThanOrEqual(1_000_000)
  expect(q.takeAll()[0]!.json.trim()).toBe("10") // 20 × 50 KB fit exactly; 0..9 dropped
  expect(q.count).toBe(0)
})
test("unshift puts records back in front", () => {
  const q = new RecordQueue()
  q.push(item("logs", "b"))
  q.unshift([item("logs", "a")])
  expect(q.takeAll().map(i => i.json)).toEqual(["a", "b"])
})
