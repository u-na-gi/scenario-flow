/**
 * Accepted forms of `apiBaseUrl`.
 *
 * - `string`: used as-is.
 * - `() => string`: called once when the scenario is constructed.
 * - `{ default, envKey? }`: `default` is used unless the environment variable
 *   named by `envKey` (default `SF_API_BASE_URL`) is set and non-empty.
 *
 * In every form a non-empty `SF_API_BASE_URL` (or the custom `envKey`) takes
 * precedence over the configured value.
 */
export type ApiBaseUrlOption =
  | string
  | (() => string)
  | {
    /** Base URL used when the environment variable is not set */
    default: string;
    /** Environment variable that overrides `default` (default: `SF_API_BASE_URL`) */
    envKey?: string;
  };

/**
 * Configuration for a scenario flow, as passed to the `ScenarioFlow` constructor.
 */
export interface ScenarioFlowConfig {
  /** Base URL for all API requests (see {@link ApiBaseUrlOption}) */
  apiBaseUrl: ApiBaseUrlOption;
}

/**
 * Configuration after `apiBaseUrl` has been resolved to a concrete string.
 * This is what `ctx.getConfig()` returns.
 */
export interface ResolvedScenarioFlowConfig extends ScenarioFlowConfig {
  /** Resolved base URL for all API requests */
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

// Import the context type to use in the step function
import type { ContextRecord, ScenarioFlowContext } from "./context.ts";

/**
 * Internal interface for a named scenario step.
 */
export interface NamedStep<Ctx extends object = ContextRecord> {
  /** Step name for logging */
  name: string;
  /** Function to execute for this step */
  fn: ScenarioFlowStepFunction<Ctx>;
}

/**
 * Function type for scenario steps.
 * Receives the scenario context and should return a Promise.
 *
 * @typeParam Ctx - Shape of the scenario context (see {@link ScenarioFlowContext})
 * @param ctx - The scenario context with HTTP client and shared state
 * @returns Promise that resolves when the step completes
 */
export type ScenarioFlowStepFunction<Ctx extends object = ContextRecord> = (
  ctx: ScenarioFlowContext<Ctx>,
) => Promise<void>;
