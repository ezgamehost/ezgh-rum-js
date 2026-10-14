// View names: route templates, never raw IDs (spec "Data model").
export const MAX_VIEW_NAME = 128
const DIGITS = /^\d+$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HEX8 = /^[0-9a-f]{8,}$/i

export function capViewName(name: string): string {
  return name.length > MAX_VIEW_NAME ? name.slice(0, MAX_VIEW_NAME) : name
}

export function templatePath(path: string): string {
  const t = path.split("/").map(seg => (DIGITS.test(seg) || UUID.test(seg) || HEX8.test(seg) ? ":id" : seg)).join("/")
  return capViewName(t || "/")
}

// For routers that expose params but not the pattern (React Router framework mode, Next.js App
// Router): each param's value is put back as `:name`; an array param (catch-all) collapses its run
// of segments into `:name*`.
export function templateFromParams(pathname: string, params: Readonly<Record<string, string | readonly string[] | undefined>>): string {
  const segs = pathname.split("/")
  const done = new Set<number>()
  const find = (value: string, from: number): number => {
    for (let i = from; i < segs.length; i++) {
      if (done.has(i)) continue
      const s = segs[i]!
      let decoded = s
      try {
        decoded = decodeURIComponent(s)
      }
      catch { /* keep raw */ }
      if (s === value || decoded === value) return i
    }
    return -1
  }
  for (const [name, value] of Object.entries(params)) {
    if (value === undefined) continue
    if (typeof value === "string") {
      const i = find(value, 1)
      if (i >= 0) {
        segs[i] = `:${name}`
        done.add(i)
      }
      continue
    }
    if (value.length === 0) continue
    const i = find(value[0]!, 1)
    if (i < 0 || !value.every((v, k) => find(v, i + k) === i + k)) continue
    segs.splice(i, value.length, `:${name}*`)
    // indices after i shifted; rebuild the done set against the new array
    const shifted = [...done].map(d => (d > i ? d - value.length + 1 : d))
    done.clear()
    for (const d of shifted) done.add(d)
    done.add(i)
  }
  return capViewName(segs.join("/") || "/")
}
