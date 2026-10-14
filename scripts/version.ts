// bun scripts/version.ts X.Y.Z: sets the version of all six packages (refuses anything not SemVer).
import { readFileSync, writeFileSync } from "node:fs"

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/
const v = process.argv[2] ?? ""
if (!SEMVER.test(v)) {
  console.error(`usage: bun scripts/version.ts X.Y.Z (got ${JSON.stringify(v)}, which isn't SemVer)`)
  process.exit(1)
}
for (const p of ["rum", "rum-react", "rum-nextjs", "rum-vue", "rum-angular", "rum-build"]) {
  const file = `packages/${p}/package.json`
  const pkg = JSON.parse(readFileSync(file, "utf8")) as { version: string }
  pkg.version = v
  writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n")
  console.log(`${file}: ${v}`)
}
