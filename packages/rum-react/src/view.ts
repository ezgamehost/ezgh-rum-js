import { useEffect } from "react"
import { startView } from "@ezghcloud/rum"

/** Starts a manual view named `name` when the component mounts or the name changes. */
export function useEzghView(name: string): void {
  useEffect(() => {
    startView(name)
  }, [name])
}
