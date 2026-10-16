// Fails when a bundle is over its gzipped budget (plan 25: core ≤ 25 KB, each framework package
// ≤ 3 KB over core). KB is 1000 bytes, the stricter reading.
type Budget = { name: string, entry: string, external: string[], limit: number }
const BUDGETS: Budget[] = [
  { name: "@ezghcloud/rum", entry: "packages/rum/src/index.ts", external: [], limit: 25_000 },
  { name: "@ezghcloud/rum (IIFE)", entry: "packages/rum/src/iife.ts", external: [], limit: 25_000 },
  { name: "@ezghcloud/rum-react", entry: "packages/rum-react/src/index.ts",
    external: ["@ezghcloud/rum", "react", "react/jsx-runtime", "react-router"], limit: 3_000 },
  { name: "@ezghcloud/rum-nextjs", entry: "packages/rum-nextjs/src/index.ts",
    external: ["@ezghcloud/rum", "react", "react/jsx-runtime", "next/navigation"], limit: 3_000 },
  { name: "@ezghcloud/rum-vue", entry: "packages/rum-vue/src/index.ts",
    external: ["@ezghcloud/rum", "vue", "vue-router"], limit: 3_000 },
  { name: "@ezghcloud/rum-angular", entry: "packages/rum-angular/src/index.ts",
    external: ["@ezghcloud/rum", "@angular/core", "@angular/router", "rxjs"], limit: 3_000 },
]
let failed = false
for (const b of BUDGETS) {
  if (!(await Bun.file(b.entry).exists())) {
    console.log(`skip ${b.name.padEnd(22)} (no ${b.entry} yet)`)
    continue
  }
  const out = await Bun.build({ entrypoints: [b.entry], target: "browser", format: "esm", minify: true,
    external: b.external, define: { __EZGH_RUM_VERSION__: "\"0.0.0\"" } })
  if (!out.success || !out.outputs[0]) throw new AggregateError(out.logs, b.name)
  const gz = Bun.gzipSync(new Uint8Array(await out.outputs[0].arrayBuffer()), { level: 9 }).byteLength
  const ok = gz <= b.limit
  failed ||= !ok
  console.log(`${ok ? "ok  " : "OVER"} ${b.name.padEnd(22)} ${(gz / 1000).toFixed(1)} KB / ${b.limit / 1000} KB`)
}
if (failed) process.exit(1)

export {}
