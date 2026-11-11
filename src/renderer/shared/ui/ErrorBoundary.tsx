// The safety net around a screen.
// Purpose: if a screen throws while rendering, show a calm message with «Ξαναδοκίμασε» instead of a white window.
// Does NOT: log to disk or report anywhere (the details are only shown for the user to copy); retry by itself.
// Owner layer: renderer/shared/ui. Why: the shell wraps every screen, and main.ts wraps the whole app.
// Covering test: test/error-boundary.test.ts (errorText); the crash markup is part of the dialog snapshots.
import { Component, type ReactNode } from 'react';
import { Button } from './Button';

/**
 * The text for a bug report: message plus the component stack (a pure function, tested without a DOM).
 * @param err - what was thrown
 * @param stack - React's component stack, when it has one
 */
export function errorText(err: unknown, stack?: string | null): string {
  const m = err instanceof Error ? (err.name !== 'Error' ? err.name + ': ' : '') + err.message : String(err);
  const s = (stack || (err instanceof Error ? err.stack : '') || '').replace(/^\s*\n+/, '').trimEnd();
  return s && !s.startsWith(m) ? m + '\n' + s : m || s;
}

type State = { err: unknown; stack: string | null; failed: boolean };
/** `whole`: the boundary of the entire app (full-window card) instead of one screen. */
export interface ErrorBoundaryProps {
  children?: ReactNode;
  whole?: boolean;
}

/** Catches render errors of its children and shows the crash card. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, State> {
  state: State = { err: null, stack: null, failed: false };
  static getDerivedStateFromError(err: unknown): Partial<State> {
    return { err: err ?? new Error('άγνωστο σφάλμα'), failed: true };
  }
  componentDidCatch(err: unknown, info: { componentStack?: string | null }) {
    this.setState({ stack: info.componentStack || null });
    console.error('Σφάλμα οθόνης:', err, info.componentStack);
  }
  retry = () => this.setState({ err: null, stack: null, failed: false });
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className={this.props.whole ? 'crash crash--whole' : 'crash'} role="alert">
        <div className="crash__card">
          <h2>Κάτι πήγε στραβά σε αυτή την οθόνη</h2>
          <p>
            Τα δεδομένα σου είναι ασφαλή: ό,τι αποθηκεύτηκε μένει. Δοκίμασε ξανά ή πήγαινε σε άλλη οθόνη από το μενού.
          </p>
          <div className="crash__btns">
            <Button variant="default" onClick={this.retry}>
              Ξαναδοκίμασε
            </Button>
            <Button variant="outline" onClick={() => location.reload()}>
              Ξαναφόρτωσε την εφαρμογή
            </Button>
          </div>
          <details>
            <summary>Λεπτομέρειες για αναφορά</summary>
            <pre>{errorText(this.state.err, this.state.stack)}</pre>
          </details>
        </div>
      </div>
    );
  }
}
