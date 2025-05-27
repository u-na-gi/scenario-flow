import { createCtx, ScenarioFlowContext } from "./context.ts";
import { ScenarioFlowConfig, ScenarioFlowRequest } from "./type.ts";

export interface ScenarioFlowChain {
  step(paren: ScenarioFlowChain): ScenarioFlowChain;
  step(fn: ScenarioFlowStepFunction): ScenarioFlowChain;
  execute(): Promise<void>;
}

export type ScenarioFlowStepFunction = (
  ctx: ScenarioFlowContext,
) => Promise<void>;

export class ScenarioFlow implements ScenarioFlowChain {
  private config: ScenarioFlowConfig;
  private ctx: ScenarioFlowContext;
  private steps: ScenarioFlowStepFunction[] = [];

  constructor(scenarioFlowChain: ScenarioFlowChain);
  constructor(config: ScenarioFlowConfig);
  constructor(arg: ScenarioFlowConfig | ScenarioFlowChain) {
    if (typeof arg === "object" && "apiBaseUrl" in arg) {
      this.config = arg;
      const fetcher = this.createFetcher();
      this.ctx = createCtx(fetcher, this.config);

      return;
    }

    if (arg instanceof ScenarioFlow) {
      this.config = arg.config;
      this.ctx = arg.ctx;

      this.steps = [...arg.steps];
      console.log("add ScenarioFlow:", this);
      return;
    }

    throw new Error(
      "Invalid argument: ScenarioFlow constructor expects ScenarioFlowConfig or ScenarioFlowChain",
    );
  }

  private createFetcher() {
    return async (req: ScenarioFlowRequest): Promise<Response> => {
      const url = this.joinUrl(...req.urlPaths);
      console.log("URL:", url);
      console.log("Request:", req);
      const response = await fetch(url, req);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response;
    };
  }

  private joinUrl(...parts: string[]): string {
    const clean = [this.config.apiBaseUrl, ...parts].map((p) =>
      p.replace(/^\/+|\/+$/g, "")
    );
    return clean.join("/");
  }

  step(parent: ScenarioFlowChain): ScenarioFlowChain;
  step(fn: ScenarioFlowStepFunction): ScenarioFlowChain;
  step(arg: ScenarioFlowStepFunction | ScenarioFlowChain): ScenarioFlowChain {
    // Implement the step logic here
    if (typeof arg === "function") {
      this.steps.push(arg);
      return this;
    }

    if (arg instanceof ScenarioFlow) {
      this.steps.push(...arg.steps);
      this.ctx.merge(arg.ctx);
      return this;
    }
    return this;
  }

  private async run(): Promise<void> {
    // stepの実行
    for (const step of this.steps) {
      try {
        await step(this.ctx);
      } catch (error) {
        console.error("Error in step:", error);
        throw error; // Rethrow the error to propagate it
      }
    }
  }

  async execute(): Promise<void> {
    try {
      await this.run();
    } catch (error) {
      console.error("Error in ScenarioFlow:", error);
      throw error; // Rethrow the error to propagate it
    }
  }
}
