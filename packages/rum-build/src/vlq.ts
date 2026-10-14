// Base64 VLQ as source maps use it (CLI L2's vlq.go): 5-bit groups, continuation bit 32, the sign
// in bit 0. Arithmetic rather than bit shifts, so large columns don't overflow 32 bits.
import { InjectError } from "./errors.ts"

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
const DIGIT = new Map([...ALPHABET].map((c, i) => [c, i]))

export function vlqDecode(s: string, at: number): { value: number, next: number } {
  let result = 0
  let shift = 0
  for (let i = at; i < s.length; i++) {
    const d = DIGIT.get(s[i]!)
    if (d === undefined || shift > 30) throw new InjectError("has malformed mappings")
    result += (d & 31) * 2 ** shift
    shift += 5
    if ((d & 32) === 0) {
      const negative = result % 2 === 1
      const magnitude = Math.floor(result / 2)
      return { value: negative ? -magnitude : magnitude, next: i + 1 }
    }
  }
  throw new InjectError("has malformed mappings")
}

export function vlqEncode(v: number): string {
  let n = v < 0 ? -v * 2 + 1 : v * 2
  let out = ""
  do {
    let digit = n % 32
    n = Math.floor(n / 32)
    if (n > 0) digit += 32
    out += ALPHABET[digit]
  } while (n > 0)
  return out
}
