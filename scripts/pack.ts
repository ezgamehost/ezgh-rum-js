// Packs the six packages into .packs/ for `npm publish` (the release workflow) and checks them:
// no `workspace:` or `catalog:` range may survive in a tarball's package.json. @ezgh/rum's README
// gets the script tag with the IIFE's SRI hash in the packed copy only (the repository's README
// keeps the placeholder). --dry-run tolerates a missing IIFE (before the core exists).
import { $ } from "bun"
import { createHash } from "node:crypto"
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"

const dryRun = process.argv.includes("--dry-run")
const ORDER = ["rum", "rum-build", "rum-react", "rum-vue", "rum-angular", "rum-nextjs"]
const SRI = /<!-- sri -->[^]*?<!-- \/sri -->/

rmSync(".packs", { recursive: true, force: true })
mkdirSync(".packs")

const iife = "packages/rum/dist/rum.iife.js"
let integrity: string | undefined
if (existsSync(iife)) integrity = "sha384-" + createHash("sha384").update(readFileSync(iife)).digest("base64")
else if (!dryRun) throw new Error(`${iife} is missing: run bun run build first`)

const rumVersion = (JSON.parse(readFileSync("packages/rum/package.json", "utf8")) as { version: string }).version
const tag = integrity
  ? `<script src="https://cdn.jsdelivr.net/npm/@ezgh/rum@${rumVersion}/dist/rum.iife.js"\n        integrity="${integrity}" crossorigin="anonymous"></script>\n<script>EzghRum.init({ token: "ezgh_ct_…", release: "…" })</script>`
  : undefined

const notes: string[] = []
for (const p of ORDER) {
  const dir = `packages/${p}`
  const pkg = JSON.parse(readFileSync(`${dir}/package.json`, "utf8")) as { name: string, version: string }
  const readme = `${dir}/README.md`
  const original = existsSync(readme) ? readFileSync(readme, "utf8") : undefined
  const license = `${dir}/LICENSE`
  const hadLicense = existsSync(license)
  try {
    if (!hadLicense) copyFileSync("LICENSE", license)
    if (p === "rum" && original !== undefined && tag) writeFileSync(readme, original.replace(SRI, `<!-- sri -->\n\`\`\`html\n${tag}\n\`\`\`\n<!-- /sri -->`))
    await $`bun pm pack --destination ${process.cwd()}/.packs --quiet`.cwd(dir)
  }
  finally {
    if (original !== undefined) writeFileSync(readme, original)
    if (!hadLicense) rmSync(license, { force: true })
  }
  const tgz = `.packs/${pkg.name.replace("@", "").replace("/", "-")}-${pkg.version}.tgz`
  if (!existsSync(tgz)) throw new Error(`${tgz} wasn't written`)
  const packed = await $`tar -xzOf ${tgz} package/package.json`.text()
  const bad = /"(?:workspace|catalog):[^"]*"/.exec(packed)
  if (bad) throw new Error(`${tgz}: package.json still has ${bad[0]}`)
  notes.push(`- \`${pkg.name}@${pkg.version}\``)
  console.log(`packed ${tgz}`)
}

writeFileSync(".packs/release-notes.md", `## Packages\n\n${notes.join("\n")}\n\n## Script tag\n\n${tag ? "```html\n" + tag + "\n```" : "(no IIFE built)"}\n`)
