// Builds every package into its dist/: unminified ESM (dependencies and peers external, as npm
// consumers bundle them), .d.ts files from tsc, and for @ezgh/rum the minified script-tag IIFE
// that jsDelivr serves (dist/rum.iife.js).
import { $ } from "bun"

type Manifest = { version: string, dependencies?: Record<string, string>, peerDependencies?: Record<string, string> }
type Entry = { src: string, target: "browser" | "node", banner?: string }
const PACKAGES: Record<string, Entry[]> = {
  "rum": [{ src: "src/index.ts", target: "browser" }],
  "rum-react": [{ src: "src/index.ts", target: "browser" }],
  "rum-nextjs": [
    { src: "src/index.ts", target: "browser", banner: "\"use client\";" },
    { src: "src/config.ts", target: "node" },
    { src: "src/instrumentation.ts", target: "node" },
  ],
  "rum-vue": [{ src: "src/index.ts", target: "browser" }],
  "rum-angular": [{ src: "src/index.ts", target: "browser" }],
  "rum-build": [{ src: "src/index.ts", target: "node" }],
}

for (const [name, entries] of Object.entries(PACKAGES)) {
  const dir = `packages/${name}`
  const pkg = await Bun.file(`${dir}/package.json`).json() as Manifest
  const external = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.peerDependencies ?? {})]
  await $`rm -rf ${dir}/dist`
  const define = { __EZGH_RUM_VERSION__: JSON.stringify(pkg.version) }
  for (const e of entries) {
    if (!(await Bun.file(`${dir}/${e.src}`).exists())) continue
    const out = await Bun.build({
      entrypoints: [`${dir}/${e.src}`], outdir: `${dir}/dist`, format: "esm", target: e.target,
      external: [...external, "node:*"], define, sourcemap: "linked", ...(e.banner ? { banner: e.banner } : {}),
    })
    if (!out.success) throw new AggregateError(out.logs, `${name}: ${e.src}`)
  }
  if (name === "rum" && await Bun.file(`${dir}/src/iife.ts`).exists()) {
    const iife = await Bun.build({
      entrypoints: [`${dir}/src/iife.ts`], format: "iife", target: "browser", minify: true, define,
      naming: "rum.iife.js", outdir: `${dir}/dist`, sourcemap: "linked",
    })
    if (!iife.success) throw new AggregateError(iife.logs, "rum: iife")
  }
  await $`bunx tsc -p ${dir}/tsconfig.build.json`
}
