// An error boundary that reports render errors (source `boundary`) with React's component stack.
import { Component, type ErrorInfo, type ReactNode } from "react"
import { _integration, type AttrValue } from "@ezghcloud/rum"

export interface EzghErrorBoundaryProps {
  children?: ReactNode
  fallback?: ReactNode | ((error: unknown, reset: () => void) => ReactNode)
  attributes?: Record<string, AttrValue>
}
interface State { error: unknown, hasError: boolean }

export class EzghErrorBoundary extends Component<EzghErrorBoundaryProps, State> {
  override state: State = { error: undefined, hasError: false }

  static getDerivedStateFromError(error: unknown): State {
    return { error, hasError: true }
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    try {
      _integration.captureBoundaryError(error, { ...this.props.attributes, "ezgh.rum.react.component_stack": (info.componentStack ?? "").slice(0, 4096) })
    }
    catch { /* never breaks rendering */ }
  }

  reset = (): void => {
    this.setState({ error: undefined, hasError: false })
  }

  override render(): ReactNode {
    if (!this.state.hasError) return this.props.children
    const f = this.props.fallback
    return typeof f === "function" ? f(this.state.error, this.reset) : (f ?? null)
  }
}
