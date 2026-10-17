import { Component } from 'react';

/** Catch rendering errors so a bug shows a friendly message instead of a blank page. */
export default class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('Slidecraft crashed while rendering:', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="crash">
        <h1>Something went wrong</h1>
        <p className="muted">The page hit an unexpected problem. Reloading usually fixes it. Copy your Markdown somewhere safe first if you can.</p>
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          Reload Slidecraft
        </button>
      </div>
    );
  }
}
