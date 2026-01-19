// Error handling utilities for consistent error management across the application

export interface ErrorContext {
  operation: string;
  userId?: string;
  patientId?: string;
  visitId?: string;
  component?: string;
  additionalData?: Record<string, any>;
}

export interface ErrorResult {
  success: false;
  error: Error;
  context?: ErrorContext;
}

export interface SuccessResult<T> {
  success: true;
  data: T;
}

export type Result<T> = SuccessResult<T> | ErrorResult;

/**
 * Standardized error handling wrapper for async operations
 */
export async function handleAsync<T>(
  operation: () => Promise<T>,
  context?: ErrorContext
): Promise<Result<T>> {
  try {
    const data = await operation();
    return { success: true, data };
  } catch (error) {
    const errorResult: ErrorResult = {
      success: false as const,
      error: error instanceof Error ? error : new Error(String(error)),
      context,
    };

    // Log error with context for debugging
    console.error(`Error in ${context?.operation || 'unknown operation'}:`, {
      error: errorResult.error,
      context,
      timestamp: new Date().toISOString(),
    });

    return errorResult;
  }
}

/**
 * Standardized error logging with context
 */
export function logError(error: Error | unknown, context: ErrorContext): void {
  console.error(`[${context.operation}] Error:`, {
    error: error instanceof Error ? error : new Error(String(error)),
    context,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Create user-friendly error messages from technical errors
 */
export function getUserFriendlyErrorMessage(error: Error | unknown): string {
  if (error instanceof Error) {
    // Network errors
    if (error.message.includes('fetch')) {
      return 'Network connection error. Please check your internet connection and try again.';
    }

    // API errors
    if (error.message.includes('404')) {
      return 'The requested resource was not found.';
    }

    if (error.message.includes('403') || error.message.includes('401')) {
      return 'You do not have permission to perform this action.';
    }

    if (error.message.includes('500')) {
      return 'Server error. Please try again later.';
    }

    // Timeout errors
    if (error.message.includes('timeout') || error.message.includes('aborted')) {
      return 'Request timed out. Please try again.';
    }

    // Validation errors
    if (error.message.includes('validation') || error.message.includes('invalid')) {
      return 'Please check your input and try again.';
    }

    // Return the original message if it's already user-friendly
    return error.message;
  }

  return 'An unexpected error occurred. Please try again.';
}

/**
 * Safe async operation wrapper that returns default value on error
 */
export async function safeAsync<T>(
  operation: () => Promise<T>,
  defaultValue: T,
  context?: ErrorContext
): Promise<T> {
  const result = await handleAsync(operation, context);
  if (result.success) {
    return result.data;
  }

  logError(result.error, { operation: context?.operation || 'safeAsync', ...context });
  return defaultValue;
}

/**
 * Retry mechanism for failed operations
 */
export async function retryAsync<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000,
  context?: ErrorContext
): Promise<Result<T>> {
  let lastError: Error;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const result = await handleAsync(operation, {
      ...context,
      operation: `${context?.operation || 'retryAsync'} (attempt ${attempt}/${maxRetries})`,
    });

    if (result.success) {
      return result;
    }

    lastError = result.error;

    // Don't delay on the last attempt
    if (attempt < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, delayMs * attempt)); // Exponential backoff
    }
  }

  return {
    success: false,
    error: lastError!,
    context,
  };
}

/**
 * Error boundary helper for React components
 */
export function createErrorBoundaryFallback(
  componentName: string,
  fallbackMessage?: string
): React.ComponentType<{ children: React.ReactNode }> {
  const FallbackComponent = ({ children }: { children: React.ReactNode }) => {
    // This would typically be implemented as a proper Error Boundary class component
    // For now, returning children directly
    return <>{children}</>;
  };

  FallbackComponent.displayName = `ErrorBoundaryFallback(${componentName})`;
  return FallbackComponent;
}