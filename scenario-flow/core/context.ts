import { ScenarioFlowConfig, ScenarioFlowRequest } from "./type.ts";

export interface ScenarioFlowContext {
  fetcher: (req: ScenarioFlowRequest) => Promise<Response>;
  customContext: Record<string, unknown>;
  addContext(key: string, value: unknown): void;
  getContext<T>(key: string): T | unknown;
  merge(ctx: ScenarioFlowContext): void;
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

export const createCtx = function (
  fetcher: (req: ScenarioFlowRequest) => Promise<Response>,
  config: ScenarioFlowConfig,
): ScenarioFlowContext {
  return new ScenarioFlowContextImple(fetcher, config);
};
