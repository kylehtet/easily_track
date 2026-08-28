import { Component } from 'react';

// Without this, one unexpected render error blanks the entire page and the user
// is left staring at white with no idea their data is still intact. It is.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('EasyPort crashed:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash">
        <div className="crash-card">
          <div className="crash-title">Something went wrong.</div>
          <p className="crash-body">
            Your properties are safe — nothing was deleted. Reloading usually
            fixes it.
          </p>
          <button className="btn-primary" onClick={() => location.reload()}>
            Reload EasyPort
          </button>
          <details className="crash-details">
            <summary>Technical details</summary>
            <pre>{String(this.state.error?.stack || this.state.error)}</pre>
          </details>
        </div>
      </div>
    );
  }
}
