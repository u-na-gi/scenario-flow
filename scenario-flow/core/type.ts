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
