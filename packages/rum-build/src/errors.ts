/** A JS file or source map that injection refuses; the message reads after the file's path. */
export class InjectError extends Error {
  override name = "InjectError"
}
