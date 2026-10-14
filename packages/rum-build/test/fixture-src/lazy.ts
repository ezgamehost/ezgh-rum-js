export function later() {
  return globalThis.location?.href ?? "lazy"
}
