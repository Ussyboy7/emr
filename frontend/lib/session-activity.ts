type SessionActivityListener = () => void;

const listeners = new Set<SessionActivityListener>();

/** Reset idle timers (user input or successful authenticated API call). */
export function notifySessionActivity() {
  listeners.forEach((listener) => listener());
}

export function subscribeSessionActivity(listener: SessionActivityListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
