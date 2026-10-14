import { expect, test } from "bun:test"
import { parseUserAgent } from "../src/useragent.ts"

const UA = {
  chromeWin: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  edge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0",
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
  ipadAsMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15",
  androidTablet: "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  androidPhone: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
  firefoxLinux: "Mozilla/5.0 (X11; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0",
}
test("browser, major version, OS and device type", () => {
  expect(parseUserAgent(UA.chromeWin)).toEqual({ browserName: "Chrome", browserVersion: "141", osName: "Windows", deviceType: "desktop" })
  expect(parseUserAgent(UA.edge).browserName).toBe("Edge")
  expect(parseUserAgent(UA.iphone)).toEqual({ browserName: "Safari", browserVersion: "18", osName: "iOS", deviceType: "mobile" })
  expect(parseUserAgent(UA.ipadAsMac, 5)).toMatchObject({ osName: "iOS", deviceType: "tablet" })
  expect(parseUserAgent(UA.ipadAsMac, 0)).toMatchObject({ osName: "macOS", deviceType: "desktop" })
  expect(parseUserAgent(UA.androidTablet)).toMatchObject({ osName: "Android", deviceType: "tablet" })
  expect(parseUserAgent(UA.androidPhone)).toMatchObject({ osName: "Android", deviceType: "mobile" })
  expect(parseUserAgent(UA.firefoxLinux)).toEqual({ browserName: "Firefox", browserVersion: "144", osName: "Linux", deviceType: "desktop" })
})
test("client hints win for the brand when present", () => {
  const hints = { brands: [{ brand: "Not=A?Brand", version: "24" }, { brand: "Microsoft Edge", version: "141" }, { brand: "Chromium", version: "141" }], mobile: false, platform: "Windows" }
  expect(parseUserAgent(UA.chromeWin, 0, hints)).toMatchObject({ browserName: "Edge", browserVersion: "141", osName: "Windows" })
})
