// Δίχτυ ασφαλείας: αν μια οθόνη σκάσει στο render, δείχνουμε ήρεμο μήνυμα αντί για λευκό παράθυρο
import { Component, type ReactNode } from 'react';
import { html, Button } from './ui';

// Κείμενο για αναφορά: μήνυμα + στοίβα συστατικών (καθαρή συνάρτηση, δοκιμάζεται χωρίς DOM)
export function errorText(err: unknown, stack?: string | null): string {
  const m = err instanceof Error ? (err.name !== 'Error' ? err.name + ': ' : '') + err.message : String(err);
  const s = (stack || (err instanceof Error ? err.stack : '') || '').replace(/^\s*\n+/, '').trimEnd();
  return s && !s.startsWith(m) ? m + '\n' + s : m || s;
}

type St = { err: unknown; stack: string | null; failed: boolean };
type Props = { children?: ReactNode; whole?: boolean };

export class ErrorBoundary extends Component<Props, St> {
  state: St = { err: null, stack: null, failed: false };
  static getDerivedStateFromError(err: unknown): Partial<St> { return { err: err ?? new Error('άγνωστο σφάλμα'), failed: true }; }
  componentDidCatch(err: unknown, info: { componentStack?: string | null }) {
    this.setState({ stack: info.componentStack || null });
    console.error('Σφάλμα οθόνης:', err, info.componentStack);
  }
  retry = () => this.setState({ err: null, stack: null, failed: false });
  render() {
    if (!this.state.failed) return this.props.children;
    return html`<div className=${this.props.whole ? 'crash crash--whole' : 'crash'} role="alert">
      <div className="crash__card">
        <h2>Κάτι πήγε στραβά σε αυτή την οθόνη</h2>
        <p>Τα δεδομένα σου είναι ασφαλή: ό,τι αποθηκεύτηκε μένει. Δοκίμασε ξανά ή πήγαινε σε άλλη οθόνη από το μενού.</p>
        <div className="crash__btns">
          <${Button} variant="default" onClick=${this.retry}>Ξαναδοκίμασε<//>
          <${Button} variant="outline" onClick=${() => location.reload()}>Ξαναφόρτωσε την εφαρμογή<//>
        </div>
        <details><summary>Λεπτομέρειες για αναφορά</summary><pre>${errorText(this.state.err, this.state.stack)}</pre></details>
      </div>
    </div>`;
  }
}
