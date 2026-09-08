/**
 * Configuration for a scenario flow.
 */
export interface ScenarioFlowConfig {
  /** Base URL for all API requests */
  apiBaseUrl: string;
}

/**
 * HTTP request configuration for scenario steps.
 * Extends the standard RequestInit with a required path.
 */
export interface ScenarioFlowRequest extends RequestInit {
  /** API endpoint path (will be joined with apiBaseUrl) */
  path: string;
  /**
   * Expected HTTP status code(s).
   * When set, the fetcher throws only if the actual status is not in this set
   * (so a scenario can assert that e.g. `401` is returned).
   * When omitted, any non-2xx status is treated as an error.
   * An empty array is rejected with an error before the request is sent.
   */
  expectStatus?: number | readonly number[];
  /**
   * Whether to throw when the response status does not meet the expectation.
   * Set to `false` to always get the `Response` back and inspect it yourself.
   *
   * With `false`, a mismatch (non-2xx, or a status outside `expectStatus`)
   * is only logged as a red status line; it does not throw and does not mark
   * the scenario as failed. Assert on the returned `Response` yourself.
   * @default true
   */
  throwOnError?: boolean;
}

/**
 * Internal interface for a named scenario step.
 */
export interface NamedStep {
  /** Step name for logging */
  name: string;
  /** Function to execute for this step */
  fn: ScenarioFlowStepFunction;
}

// Import the context type to use in the step function
import type { ScenarioFlowContext } from "./context.ts";

/**
 * Function type for scenario steps.
 * Receives the scenario context and should return a Promise.
 *
 * @param ctx - The scenario context with HTTP client and shared state
 * @returns Promise that resolves when the step completes
 */
export type ScenarioFlowStepFunction = (
  ctx: ScenarioFlowContext,
) => Promise<void>;
