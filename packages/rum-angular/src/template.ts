export interface SnapshotLike { routeConfig?: { path?: string } | null, firstChild?: SnapshotLike | null }

/** Joins routeConfig.path along the primary firstChild chain, skipping "" segments. */
export function angularTemplate(root: SnapshotLike): string {
  const parts: string[] = []
  for (let s: SnapshotLike | null | undefined = root; s; s = s.firstChild) {
    const p = s.routeConfig?.path
    if (p) parts.push(p)
  }
  return "/" + parts.join("/")
}
