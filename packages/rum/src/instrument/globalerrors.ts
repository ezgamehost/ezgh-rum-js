// Uncaught errors (ErrorEvent only: resource load errors are ignored) and unhandled rejections.
import type { Rum } from "../rum.ts"

export function installGlobalErrors(r: Rum): void {
  addEventListener("error", r.guard.wrap((e: Event) => {
    if (!(e instanceof ErrorEvent) || (!e.error && !e.message)) return
    let err: unknown = e.error
    if (err === undefined || err === null) {
      const synthetic = new Error(e.message)
      synthetic.stack = `Error: ${e.message}\n    at ${e.filename || "<anonymous>"}:${e.lineno}:${e.colno}`
      err = synthetic
    }
    r.captureError(err, "uncaught")
  }), true)
  addEventListener("unhandledrejection", r.guard.wrap((e: PromiseRejectionEvent) => {
    r.captureError(e.reason, "unhandledrejection")
  }), true)
}
