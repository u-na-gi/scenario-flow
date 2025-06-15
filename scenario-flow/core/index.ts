import { createCtx, type ScenarioFlowContext } from "./context.ts";
import type {
  NamedStep,
  ScenarioFlowConfig,
  ScenarioFlowRequest,
  ScenarioFlowStepFunction,
} from "./type.ts";
import { logger } from "./logger.ts";

/**
 * Interface for chaining scenario steps together.
 * Provides a fluent API for building test scenarios.
 */
export interface ScenarioFlowChain {
  /**
   * Add a step to the scenario chain.
   * @param name - Descriptive name for the step
   * @param fn - Function to execute for this step
   * @returns The chain for method chaining
   */
  step(name: string, fn: ScenarioFlowStepFunction): ScenarioFlowChain;
  /**
   * Add another scenario chain as a step.
   * @param parent - Another scenario chain to execute
   * @returns The chain for method chaining
   */
  step(parent: ScenarioFlowChain): ScenarioFlowChain;
  /**
   * Execute all steps in the scenario.
   * @returns Promise that resolves when all steps complete
   */
  execute(): Promise<void>;
}

// Re-export the type from type.ts
/** Function type for scenario steps */
export type { ScenarioFlowStepFunction } from "./type.ts";

/**
 * Main class for creating and executing test scenarios.
 * Provides a fluent API for building chains of API calls with automatic logging.
 * 
 * @example
 * ```typescript
 * const scenario = new ScenarioFlow("Login Flow", { apiBaseUrl: "https://api.example.com" });
 * 
 * await scenario
 *   .step("Login", async (ctx) => {
 *     const response = await ctx.fetcher({ path: "/auth/login", method: "POST" });
 *     const data = await response.json();
 *     ctx.addContext("token", data.token);
 *   })
 *   .execute();
 * ```
 */
export class ScenarioFlow implements ScenarioFlowChain {
  private scenarioName: string;
  private config: ScenarioFlowConfig;
  private ctx: ScenarioFlowContext;
  private steps: NamedStep[] = [];

  /**
   * Create a new scenario with configuration.
   * @param name - Descriptive name for the scenario
   * @param config - Configuration object with apiBaseUrl
   */
  constructor(name: string, config: ScenarioFlowConfig);
  /**
   * Create a new scenario by chaining another scenario.
   * @param name - Descriptive name for the scenario
   * @param scenarioFlowChain - Another scenario to chain
   */
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
      const url = this.joinUrl(req.path);
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

  private joinUrl(parts: string): string {
    const clean = [this.config.apiBaseUrl, parts].map((p) =>
      p.replace(/^\/+|\/+$/g, "")
    );
    return clean.join("/");
  }

  /**
   * Add a step to the scenario.
   * @param name - Step name for logging
   * @param fn - Function to execute
   * @returns The scenario chain for method chaining
   */
  step(name: string, fn: ScenarioFlowStepFunction): ScenarioFlowChain;
  /**
   * Add another scenario as a step.
   * @param parent - Another scenario to execute
   * @returns The scenario chain for method chaining
   */
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

  /**
   * Execute all steps in the scenario.
   * Logs the scenario execution and handles errors appropriately.
   * @throws Error if any step fails
   */
  async execute(): Promise<void> {
    try {
      await this.run();
    } catch (error) {
      logger.logError(`Error in scenario "${this.scenarioName}": ${error}`);
      throw error;
    }
  }
}
