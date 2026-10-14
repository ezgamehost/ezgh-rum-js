import { expect, test } from "bun:test"
import { takeViewEvent, type ViewState } from "../src/views.ts"

test("update counts up from 0; counts are increments; vitals are the latest in every event", () => {
  const v: ViewState = { id: "a".repeat(32), name: "/cart", start: 1_000, loadingEnd: 1_800, update: 0,
    counts: { errors: 2, requests: 5, long_tasks: 1, actions: 3 }, vitals: { lcp: 1200, fcp: 400, ttfb: 90, cls: 0.02 } }
  const first = takeViewEvent(v, 5_000, false)
  expect(first).toMatchObject({ "event.name": "ezgh.rum.view", "ezgh.rum.view.update": 0, "ezgh.rum.view.final": false,
    "ezgh.rum.view.duration_ms": 4000, "ezgh.rum.view.loading_ms": 800, "ezgh.rum.view.errors": 2, "ezgh.rum.view.requests": 5,
    "ezgh.rum.vitals.lcp": 1200, "ezgh.rum.vitals.cls": 0.02 })
  expect(first["ezgh.rum.vitals.inp"]).toBeUndefined()
  v.counts.requests += 1
  v.vitals.inp = 64
  const second = takeViewEvent(v, 9_000, true)
  expect(second).toMatchObject({ "ezgh.rum.view.update": 1, "ezgh.rum.view.final": true, "ezgh.rum.view.errors": 0,
    "ezgh.rum.view.requests": 1, "ezgh.rum.vitals.lcp": 1200, "ezgh.rum.vitals.inp": 64, "ezgh.rum.view.duration_ms": 8000 })
})
