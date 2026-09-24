/**
 * Deterministic resolution budget for bootstrap queries.
 *
 * A request that never settles is indistinguishable from a slow one, and the
 * UI treats "still pending" as "keep showing the loading screen". That is how
 * a fully authenticated user ends up parked on a session screen forever. Every
 * gate that can block the whole app must therefore have a hard deadline: after
 * it, the query FAILS (a recoverable, retryable state) instead of hanging.
 *
 * Pure: no React, no network, no i18n.
 */

export const RESOLUTION_TIMEOUT_CODE = "RESOLUTION_TIMEOUT";

/** Default budget for workspace/product-access bootstrap reads. */
export const BOOTSTRAP_RESOLUTION_TIMEOUT_MS = 10_000;

export interface TimeoutError extends Error {
  code: string;
}

export function isResolutionTimeout(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === RESOLUTION_TIMEOUT_CODE;
}

/**
 * Resolves with the promise's value, or rejects with a coded timeout error once
 * `ms` elapses. The underlying request is not cancelled when it does not accept
 * a signal; callers that support cancellation should pass `onTimeout` to abort.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
  onTimeout?: () => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout?.();
      const error = new Error(`${label} did not resolve within ${ms}ms`) as TimeoutError;
      error.code = RESOLUTION_TIMEOUT_CODE;
      reject(error);
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
