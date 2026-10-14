// exception.* attributes from anything thrown. Non-Errors are described without serializing them
// (never JSON.stringify, which could copy customer data).
export type ErrorSource = "uncaught" | "unhandledrejection" | "boundary" | "manual"

const cap = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s)

function isErrorLike(v: unknown): v is Error {
  if (v instanceof Error) return true
  const e = v as Partial<Error> | null
  return typeof e === "object" && e !== null && typeof e.message === "string" && typeof e.name === "string" && typeof e.stack === "string"
}

export function exceptionAttrs(err: unknown, source: ErrorSource): { type: string, message: string, stack: string } {
  if (isErrorLike(err)) {
    let type: string
    try {
      type = err.name || (err.constructor as { name?: string } | undefined)?.name || "Error"
    }
    catch { type = "Error" }
    return { type: cap(String(type), 256), message: cap(String(err.message), 4096), stack: cap(typeof err.stack === "string" ? err.stack : "", 32_768) }
  }
  let message: string
  try {
    message = err !== null && (typeof err === "object" || typeof err === "function") ? Object.prototype.toString.call(err) : String(err)
  }
  catch { message = "" }
  return { type: source === "unhandledrejection" ? "UnhandledRejection" : "Error", message: cap(message, 4096), stack: "" }
}
