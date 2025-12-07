/**
 * Custom authentication error classes
 */
export class AuthenticationError extends Error {
  constructor(message: string = "Authentication required") {
    super(message);
    this.name = "AuthenticationError";
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

export class AuthenticationExpiredError extends Error {
  constructor(message: string = "Authentication expired") {
    super(message);
    this.name = "AuthenticationExpiredError";
    Object.setPrototypeOf(this, AuthenticationExpiredError.prototype);
  }
}

/**
 * Check if an error is an authentication error
 */
export const isAuthenticationError = (error: unknown): boolean => {
  if (error instanceof AuthenticationError || error instanceof AuthenticationExpiredError) {
    return true;
  }
  if (error instanceof Error) {
    return error.message === "Authentication required" || 
           error.message === "Authentication expired" ||
           error.message.includes("Authentication");
  }
  return false;
};
