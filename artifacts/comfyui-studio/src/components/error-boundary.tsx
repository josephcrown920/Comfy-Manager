import React, { Component, ReactNode } from "react";

interface Props {
  children?: ReactNode;
  resetKey?: any;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public componentDidUpdate(prevProps: Props) {
    if (this.props.resetKey !== prevProps.resetKey) {
      this.setState({ hasError: false, error: null });
    }
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-6">
          <div className="bg-destructive/10 text-destructive border border-destructive/20 p-4 rounded-md">
            <h2 className="font-bold mb-2">Something went wrong.</h2>
            <pre className="text-sm overflow-auto">{this.state.error?.message}</pre>
            <button 
              className="mt-4 px-4 py-2 bg-destructive text-destructive-foreground rounded-md text-sm"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              Try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
