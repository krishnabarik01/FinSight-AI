import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  pageName?: string;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[ErrorBoundary] Caught error in ${this.props.pageName || 'Component'}:`, error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex items-center justify-center p-6 min-h-[300px] w-full">
          <div className="bg-white border border-slate-200/80 rounded-2xl p-8 max-w-md w-full text-center shadow-sm">
            <div className="w-12 h-12 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-center mx-auto mb-4 text-amber-600">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900 mb-2">
              {this.props.pageName ? `Could not load ${this.props.pageName}` : 'Something went wrong'}
            </h3>
            <p className="text-sm text-slate-500 mb-6 leading-relaxed">
              {this.state.error?.message || 'An unexpected rendering error occurred. You can retry or reload.'}
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={this.handleReset}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm inline-flex items-center gap-1.5"
              >
                <RefreshCw className="w-4 h-4" />
                Retry
              </button>
              <button
                type="button"
                onClick={this.handleReload}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors"
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
