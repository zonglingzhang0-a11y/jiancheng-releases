import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RotateCcw } from 'lucide-react'

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[renderer]', error, info.componentStack)
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div className="crash">
        <div className="crash-card">
          <div className="crash-title">界面出了点问题</div>
          <div className="crash-sub">你的日程数据已安全保存，重新加载即可恢复。</div>
          <pre className="crash-msg">{this.state.error.message}</pre>
          <button className="btn btn-primary" onClick={() => location.reload()}>
            <RotateCcw size={14} />
            重新加载
          </button>
        </div>
      </div>
    )
  }
}
