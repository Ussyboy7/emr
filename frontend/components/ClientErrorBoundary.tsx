"use client";

import React, { type ReactNode, Component, ErrorInfo } from 'react';

interface ClientErrorBoundaryProps {
  children: ReactNode;
}

interface ClientErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

export class ClientErrorBoundary extends Component<ClientErrorBoundaryProps, ClientErrorBoundaryState> {
  constructor(props: ClientErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ClientErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ error, errorInfo });

    // Log the error with component stack for debugging
    console.error('Client Error Boundary caught an error:', error);
    console.error('Error Info:', errorInfo);

    // Check if this is the specific "Objects are not valid as a React child" error
    if (error.message.includes('Objects are not valid as a React child')) {
      console.error('🔍 REACT OBJECT RENDERING ERROR DETECTED');
      console.error('Error occurred in component stack:', errorInfo.componentStack);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="max-w-md w-full p-6 bg-card border border-border rounded-lg shadow-lg">
            <div className="text-center">
              <div className="w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-destructive" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-foreground mb-2">Something went wrong</h2>
              <p className="text-sm text-muted-foreground mb-4">
                {this.state.error?.message || 'An unexpected error occurred'}
              </p>
              {process.env.NODE_ENV === 'development' && this.state.errorInfo && (
                <details className="text-left mb-4">
                  <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
                    Error Details (Development)
                  </summary>
                  <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-auto max-h-40">
                    {this.state.error?.stack}
                    {this.state.errorInfo.componentStack}
                  </pre>
                </details>
              )}
              <button
                onClick={() => window.location.reload()}
                className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
