import { createCtx, ScenarioFlowContext } from "./context.ts";
import {
  NamedStep,
  ScenarioFlowConfig,
  ScenarioFlowRequest,
  ScenarioFlowStepFunction,
} from "./type.ts";
import { logger } from "./logger.ts";

export interface ScenarioFlowChain {
  step(name: string, fn: ScenarioFlowStepFunction): ScenarioFlowChain;
  step(parent: ScenarioFlowChain): ScenarioFlowChain;
  execute(): Promise<void>;
}

// Re-export the type from type.ts
export type { ScenarioFlowStepFunction } from "./type.ts";

export class ScenarioFlow implements ScenarioFlowChain {
  private scenarioName: string;
  private config: ScenarioFlowConfig;
  private ctx: ScenarioFlowContext;
  private steps: NamedStep[] = [];

  constructor(name: string, config: ScenarioFlowConfig);
  constructor(name: string, scenarioFlowChain: ScenarioFlowChain);
  constructor(name: string, arg: ScenarioFlowConfig | ScenarioFlowChain) {
    this.scenarioName = name;

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
      return;
    }

    throw new Error(
      "Invalid argument: ScenarioFlow constructor expects ScenarioFlowConfig or ScenarioFlowChain",
    );
  }

  private createFetcher() {
    return async (req: ScenarioFlowRequest): Promise<Response> => {
      const url = this.joinUrl(...req.urlPaths);
      const requestStartTime = performance.now();

      // Log request
      const method = req.method || "GET";
      const bodyStr = req.body
        ? (typeof req.body === "string" ? req.body : "[Binary Data]")
        : undefined;
      logger.logRequest(method, url, bodyStr);

      const response = await fetch(url, req);
      const requestDuration = performance.now() - requestStartTime;

      // Log response
      let responseBody: string | undefined;
      try {
        const clonedResponse = response.clone();
        const text = await clonedResponse.text();
        responseBody = text;
      } catch {
        responseBody = "[Unable to read response body]";
      }

      logger.logResponse(
        response.status,
        response.statusText,
        requestDuration,
        responseBody,
      );

      if (!response.ok) {
        logger.logError(`HTTP error! status: ${response.status}`);
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

  step(name: string, fn: ScenarioFlowStepFunction): ScenarioFlowChain;
  step(parent: ScenarioFlowChain): ScenarioFlowChain;
  step(
    nameOrParent: string | ScenarioFlowChain,
    fn?: ScenarioFlowStepFunction,
  ): ScenarioFlowChain {
    if (typeof nameOrParent === "string" && fn) {
      this.steps.push({ name: nameOrParent, fn });
      return this;
    }

    if (nameOrParent instanceof ScenarioFlow) {
      this.steps.push(...nameOrParent.steps);
      this.ctx.merge(nameOrParent.ctx);
      return this;
    }

    throw new Error("Invalid step arguments");
  }

  private async run(): Promise<void> {
    logger.startScenario(this.scenarioName);

    try {
      for (const step of this.steps) {
        logger.startStep(step.name);
        try {
          await step.fn(this.ctx);
          logger.endStep();
        } catch (error) {
          logger.logError(`Error in step "${step.name}": ${error}`);
          logger.endStep();
          throw error;
        }
      }
    } finally {
      logger.endScenario();
    }
  }

  async execute(): Promise<void> {
    try {
      await this.run();
    } catch (error) {
      logger.logError(`Error in scenario "${this.scenarioName}": ${error}`);
      throw error;
    }
  }
}
