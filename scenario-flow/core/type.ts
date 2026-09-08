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
