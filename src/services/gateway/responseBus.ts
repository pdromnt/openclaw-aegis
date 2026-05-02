// ═══════════════════════════════════════════════════════════
// ResponseBus — Wait for Gateway streaming responses
//
// Bridges the gap between gateway.sendMessage() (returns ACK)
// and the actual AI response (arrives via chat events).
// ═══════════════════════════════════════════════════════════

interface ResponseWaiter {
  resolve: (text: string) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const pending = new Map<string, ResponseWaiter>();

/**
 * Wait for a chat response with the given runId.
 * Resolves when ChatHandler fires 'final' for this runId.
 */
export function waitForResponse(runId: string, timeoutMs = 60000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (pending.has(runId)) {
        pending.delete(runId);
        reject(new Error(`Response timeout after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    pending.set(runId, { resolve, reject, timer });
  });
}

/**
 * Called by ChatHandler when a response is complete (state=final).
 * Returns true if a waiter was found and resolved.
 */
export function resolveResponse(runId: string, text: string): boolean {
  const w = pending.get(runId);
  if (w) {
    clearTimeout(w.timer);
    pending.delete(runId);
    w.resolve(text);
    return true;
  }
  return false;
}

/**
 * Check if a waiter exists for this runId (used to suppress chat UI for Voice).
 */
export function hasPendingWaiter(runId: string): boolean {
  return pending.has(runId);
}

/**
 * Called by ChatHandler on error/abort.
 */
export function rejectResponse(runId: string, error: string): void {
  const w = pending.get(runId);
  if (w) {
    clearTimeout(w.timer);
    pending.delete(runId);
    w.reject(new Error(error));
  }
}
