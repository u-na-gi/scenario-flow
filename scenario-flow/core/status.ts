/**
 * Status-check helpers used by the fetcher.
 * @internal
 */

/**
 * Result of evaluating a response status against a request's expectation.
 */
export interface StatusVerdict {
  /**
   * `true` when the status satisfies the expectation:
   * in `expectStatus` when it is set, otherwise any 2xx status.
   */
  matched: boolean;
  /** `true` when the fetcher should throw (mismatch and `throwOnError`). */
  shouldThrow: boolean;
}

/**
 * Check whether `status` is in the expected set.
 * A `2xx` status matches when no expectation is given.
 */
export function isExpectedStatus(
  status: number,
  expectStatus?: number | number[],
): boolean {
  if (expectStatus === undefined) {
    return status >= 200 && status < 300;
  }
  return Array.isArray(expectStatus)
    ? expectStatus.includes(status)
    : expectStatus === status;
}

/**
 * Decide whether a response status is acceptable and whether to throw.
 *
 * @param status - Actual HTTP status
 * @param expectStatus - Expected status code(s); `undefined` means "any 2xx"
 * @param throwOnError - When `false`, never throw (default `true`)
 */
export function resolveStatusExpectation(
  status: number,
  expectStatus?: number | number[],
  throwOnError = true,
): StatusVerdict {
  const matched = isExpectedStatus(status, expectStatus);
  return { matched, shouldThrow: !matched && throwOnError };
}

/** Format an expectation for log and error messages, e.g. `401` or `400 | 422`. */
export function formatExpectedStatus(expectStatus: number | number[]): string {
  return Array.isArray(expectStatus)
    ? expectStatus.join(" | ")
    : `${expectStatus}`;
}

/**
 * Build the error message for a status mismatch.
 * Keeps the legacy `HTTP error! status: N` text when no expectation was given.
 */
export function formatStatusMismatch(
  status: number,
  expectStatus: number | number[] | undefined,
  method: string,
  url: string,
): string {
  if (expectStatus === undefined) {
    return `HTTP error! status: ${status}`;
  }
  return `Expected status ${
    formatExpectedStatus(expectStatus)
  } but got ${status} (${method} ${url})`;
}
