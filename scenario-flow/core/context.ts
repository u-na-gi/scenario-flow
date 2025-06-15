import type { ScenarioFlowConfig, ScenarioFlowRequest } from "./type.ts";

/**
 * Context object passed to each scenario step.
 * Provides HTTP client and shared state management.
 */
export interface ScenarioFlowContext {
  /** HTTP client for making requests */
  fetcher: (req: ScenarioFlowRequest) => Promise<Response>;
  /** Shared context data between steps */
  customContext: Record<string, unknown>;
  /**
   * Store data in the context for use in later steps.
   * @param key - Context key
   * @param value - Value to store
   */
  addContext(key: string, value: unknown): void;
  /**
   * Retrieve data from the context.
   * @param key - Context key
   * @returns The stored value or undefined
   */
  getContext<T>(key: string): T | unknown;
  /**
   * Merge another context into this one.
   * @param ctx - Context to merge
   */
  merge(ctx: ScenarioFlowContext): void;
  /**
   * Get the scenario configuration.
   * @returns The configuration object
   */
  getConfig(): ScenarioFlowConfig;
}

class ScenarioFlowContextImple implements ScenarioFlowContext {
  fetcher: (req: ScenarioFlowRequest) => Promise<Response>;
  customContext: Record<string, unknown>;
  private config: ScenarioFlowConfig;

  constructor(
    fetcher: (req: ScenarioFlowRequest) => Promise<Response>,
    config: ScenarioFlowConfig,
  ) {
    this.fetcher = fetcher;
    this.customContext = {};
    this.config = config;
  }

  getConfig(): ScenarioFlowConfig {
    return this.config;
  }

  addContext(key: string, value: unknown) {
    this.customContext[key] = value;
  }

  getContext<T>(key: string): T | unknown {
    return this.customContext[key];
  }

  merge(ctx: ScenarioFlowContext) {
    this.customContext = { ...this.customContext, ...ctx.customContext };
  }
}

/**
 * Create a new scenario context.
 * @param fetcher - HTTP client function
 * @param config - Scenario configuration
 * @returns New context instance
 */
export const createCtx = function (
  fetcher: (req: ScenarioFlowRequest) => Promise<Response>,
  config: ScenarioFlowConfig,
): ScenarioFlowContext {
  return new ScenarioFlowContextImple(fetcher, config);
};
