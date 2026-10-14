import { test, expect, waitFor, spans, views, attr } from "./intake.ts"

test("a route change starts a view named by the route template and ends the previous one", async ({ page, ct }) => {
  await page.goto(`/?ct=${ct}`)
  await waitFor(ct, c => spans(c).some(s => s.name === "documentLoad"), page)
  await page.getByRole("link", { name: "User 42" }).click()
  await expect(page.getByRole("heading", { name: "User42" })).toBeVisible()
  const caps = await waitFor(ct, c => spans(c).some(s => s.name === "routeChange"), page)
  const rc = spans(caps).find(s => s.name === "routeChange")!
  expect(attr(rc.attributes, "ezgh.rum.route.to")).toBe("/users/:id")
  expect(attr(rc.attributes, "ezgh.rum.route.from")).toBe("/")
  expect(attr(rc.attributes, "ezgh.rum.view.name")).toBe("/users/:id")
  const load = spans(caps).find(s => s.name === "documentLoad")!
  expect(attr(rc.attributes, "ezgh.rum.view.id")).not.toBe(attr(load.attributes, "ezgh.rum.view.id"))
  const ended = views(caps).find(v => attr(v.attributes, "ezgh.rum.view.id") === attr(load.attributes, "ezgh.rum.view.id"))!
  expect(attr(ended.attributes, "ezgh.rum.view.final")).toBe(true)
  expect(attr(ended.attributes, "ezgh.rum.view.update")).toBe(0)
  expect(attr(ended.attributes, "ezgh.rum.view.duration_ms")).toBeGreaterThan(0)
  expect(attr(ended.attributes, "ezgh.rum.view.loading_ms")).toBeGreaterThan(0)

  await page.getByRole("link", { name: "Home" }).click()
  await page.getByRole("link", { name: "User UUID" }).click()
  const more = await waitFor(ct, c => spans(c).filter(s => s.name === "routeChange").length >= 3, page)
  expect(spans(more).filter(s => s.name === "routeChange").map(s => attr(s.attributes, "ezgh.rum.route.to"))).toContain("/users/:id")
})
