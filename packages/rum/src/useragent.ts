// Small on purpose (no UA library): major version only, three device types.
export interface Agent { browserName: string, browserVersion: string, osName: string, deviceType: "desktop" | "mobile" | "tablet" }
export interface UAHints { brands: Array<{ brand: string, version: string }>, mobile: boolean, platform: string }
const BROWSERS: Array<[RegExp, string]> = [
  [/Edg(?:e|A|iOS)?\/(\d+)/, "Edge"], [/OPR\/(\d+)/, "Opera"], [/SamsungBrowser\/(\d+)/, "Samsung Internet"],
  [/(?:Firefox|FxiOS)\/(\d+)/, "Firefox"], [/(?:CriOS|Chrome)\/(\d+)/, "Chrome"], [/Version\/(\d+)[^ ]* (?:Mobile\/\S+ )?Safari\//, "Safari"],
]
const BRANDS: Record<string, string> = { "Google Chrome": "Chrome", "Microsoft Edge": "Edge", "Opera": "Opera", "Brave": "Brave", "Chromium": "Chromium" }
export function parseUserAgent(ua: string, touchPoints = 0, hints?: UAHints): Agent {
  let browserName = "Other", browserVersion = ""
  for (const [re, name] of BROWSERS) {
    const m = re.exec(ua)
    if (m) {
      browserName = name
      browserVersion = m[1]!
      break
    }
  }
  if (hints?.brands.length) {
    const known = hints.brands.map(b => [BRANDS[b.brand], b.version] as const).filter(([n]) => n)
    const pick = known.find(([n]) => n !== "Chromium") ?? known[0]
    if (pick) {
      browserName = pick[0]!
      browserVersion = pick[1]
    }
  }
  const macTouch = /Macintosh/.test(ua) && touchPoints > 1
  const osName = /Windows/.test(ua)
    ? "Windows"
    : /Android/.test(ua)
      ? "Android"
      : /iPhone|iPad|iPod/.test(ua) || macTouch
        ? "iOS"
        : /CrOS/.test(ua) ? "ChromeOS" : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "Other"
  const deviceType = /iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua)) || macTouch
    ? "tablet"
    : hints?.mobile || /Mobi|iPhone|iPod|Android/.test(ua) ? "mobile" : "desktop"
  return { browserName, browserVersion, osName, deviceType }
}
