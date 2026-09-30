/**
 * Crash shield for every lane slot. If a panel throws while rendering, ONLY that panel shows an error card; the editor,
 * the other tabs and the top bar keep working. Owner: Lane A (shell). Lanes do not need to touch this.
 *
 * Dev-only test hook: open the app with ?crash=<panel name> (for example ?crash=ai) to force that panel to throw.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportError } from '../clientlog';

function Bomb({ name }: { name: string }): null {
  if (import.meta.env.DEV && new URLSearchParams(location.search).get('crash') === name) {
    throw new Error(`forced crash in panel "${name}" (?crash=${name})`);
  }
  return null;
}

interface Props {
  name: string;
  children: ReactNode;
  /** Smaller fallback for slots in the top bar. */
  compact?: boolean;
}
interface State {
  error: Error | null;
  attempt: number;
}

export class PanelBoundary extends Component<Props, State> {
  state: State = { error: null, attempt: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[panel:${this.props.name}] crashed`, error, info.componentStack);
    reportError(`panel ${this.props.name} crashed: ${error.message}`, 'PanelBoundary', error.stack);
  }

  render() {
    const { error, attempt } = this.state;
    const { name, compact, children } = this.props;
    if (error) {
      if (compact) {
        return (
          <button className="btn btn-outline btn-sm" data-testid="panel-crash" data-panel={name} title={error.message} onClick={() => this.setState({ error: null, attempt: attempt + 1 })}>
            {name} crashed - retry
          </button>
        );
      }
      return (
        <div role="alert" data-testid="panel-crash" data-panel={name} style={{ border: '1px solid var(--danger)', borderRadius: 4, padding: 14, background: 'var(--danger-bg)' }}>
          <div className="eyebrow" style={{ color: 'var(--danger)' }}>
            panel error · {name}
          </div>
          <div style={{ fontSize: 14, fontWeight: 550, margin: '6px 0 4px' }}>This panel hit an error and was stopped.</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>
            The rest of the app is fine. Tell the owner of this panel what you were doing, then try again.
          </div>
          <pre className="mono" style={{ margin: '10px 0', padding: 8, background: 'var(--panel)', border: '1px solid var(--rule-soft)', borderRadius: 3, fontSize: 11.5, whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'auto' }}>
            {error.message}
          </pre>
          <button className="btn btn-outline btn-sm" onClick={() => this.setState({ error: null, attempt: attempt + 1 })}>
            Reload panel
          </button>
        </div>
      );
    }
    return (
      <div key={attempt} style={{ height: '100%' }}>
        <Bomb name={name} />
        {children}
      </div>
    );
  }
}
