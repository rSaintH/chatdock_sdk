import { Component, type ErrorInfo, type ReactNode } from "react";

type ChatbotErrorBoundaryProps = {
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  onError?: (error: Error, info: ErrorInfo) => void;
  children: ReactNode;
};

type ChatbotErrorBoundaryState = {
  error?: Error;
};

export class ChatbotErrorBoundary extends Component<
  ChatbotErrorBoundaryProps,
  ChatbotErrorBoundaryState
> {
  state: ChatbotErrorBoundaryState = {};

  static getDerivedStateFromError(error: Error): ChatbotErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.(error, info);
  }

  reset = () => {
    this.setState({ error: undefined });
  };

  render() {
    if (this.state.error) {
      if (typeof this.props.fallback === "function") {
        return this.props.fallback(this.state.error, this.reset);
      }

      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div role="alert" className="cb-sdk-error-boundary">
          <strong>Something went wrong.</strong>
          <button type="button" onClick={this.reset}>
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
