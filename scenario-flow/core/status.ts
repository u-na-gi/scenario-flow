/**
 * Status-check helpers used by the fetcher.
 * @internal
 */

/** Expected status code(s) as accepted by `ScenarioFlowRequest.expectStatus`. */
export type ExpectedStatus = number | readonly number[];

/**
 * Check whether `status` is in the expected set.
 * A `2xx` status matches when no expectation is given.
 */
export function isExpectedStatus(
  status: number,
  expectStatus?: ExpectedStatus,
): boolean {
  if (expectStatus === undefined) {
    return status >= 200 && status < 300;
  }
  return typeof expectStatus === "number"
    ? expectStatus === status
    : expectStatus.includes(status);
}

/** Format an expectation for log and error messages, e.g. `401` or `400 | 422`. */
export function formatExpectedStatus(expectStatus: ExpectedStatus): string {
  return typeof expectStatus === "number"
    ? `${expectStatus}`
    : expectStatus.join(" | ");
}

/**
 * Build the error message for a status mismatch.
 * Keeps the legacy `HTTP error! status: N` text when no expectation was given.
 */
export function formatStatusMismatch(
  status: number,
  expectStatus: ExpectedStatus | undefined,
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
