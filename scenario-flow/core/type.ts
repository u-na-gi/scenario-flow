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
