export interface ScenarioFlowConfig {
  apiBaseUrl: string;
}

export interface ScenarioFlowRequest extends RequestInit {
  urlPaths: string[];
}

export interface NamedStep {
  name: string;
  fn: ScenarioFlowStepFunction;
}

// Import the context type to use in the step function
import type { ScenarioFlowContext } from "./context.ts";

export type ScenarioFlowStepFunction = (
  ctx: ScenarioFlowContext,
) => Promise<void>;
