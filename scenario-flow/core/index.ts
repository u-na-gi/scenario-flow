import { createCtx, type ScenarioFlowContext } from "./context.ts";
import type {
  NamedStep,
  ResolvedScenarioFlowConfig,
  ScenarioFlowConfig,
  ScenarioFlowRequest,
  ScenarioFlowStepFunction,
} from "./type.ts";
import { logger } from "./logger.ts";
import { formatStatusMismatch, isExpectedStatus } from "./status.ts";
import { describeResponseBody, type ResponseBodyLog } from "./response-body.ts";
import { resolveConfig } from "./config.ts";
import { isAssertionError, ScenarioAssertionError } from "./assert.ts";

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
  private config: ResolvedScenarioFlowConfig;
  private ctx: ScenarioFlowContext;
  private steps: NamedStep[] = [];

  /**
   * Create a new scenario with configuration.
   * @param name - Descriptive name for the scenario
   * @param config - Configuration object with apiBaseUrl. `apiBaseUrl` is
   *   resolved once here; a non-empty `SF_API_BASE_URL` environment variable
   *   (or the custom `envKey`) takes precedence over the configured value.
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
      this.config = resolveConfig(arg);
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
      // Strip scenario-flow-only options so only RequestInit reaches fetch()
      const { path, expectStatus, throwOnError = true, ...init } = req;
      if (Array.isArray(expectStatus) && expectStatus.length === 0) {
        throw new Error("expectStatus must not be empty");
      }
      const url = this.joinUrl(path);
      const requestStartTime = performance.now();

      // Log request
      const method = req.method || "GET";
      const bodyStr = req.body
        ? (typeof req.body === "string" ? req.body : "[Binary Data]")
        : undefined;
      logger.logRequest(method, url, bodyStr);

      const response = await fetch(url, init);
      const requestDuration = performance.now() - requestStartTime;

      // Log response (read the clone once as bytes; binary bodies are not
      // decoded, see response-body.ts)
      let responseBody: string | ResponseBodyLog;
      try {
        const clonedResponse = response.clone();
        const bytes = new Uint8Array(await clonedResponse.arrayBuffer());
        responseBody = describeResponseBody(
          bytes,
          response.headers.get("content-type"),
        );
      } catch {
        responseBody = "[Unable to read response body]";
      }

      logger.logResponse(
        response.status,
        response.statusText,
        requestDuration,
        responseBody,
        expectStatus,
      );

      if (throwOnError && !isExpectedStatus(response.status, expectStatus)) {
        const message = formatStatusMismatch(
          response.status,
          expectStatus,
          method,
          url,
        );
        logger.logError(message);
        throw new Error(message);
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
          if (error instanceof ScenarioAssertionError) {
            logger.logAssertionFailure(
              error.assertionMessage,
              error.expected,
              error.actual,
              error.location,
              error.source,
            );
          } else if (isAssertionError(error)) {
            // Raw @std/assert AssertionError: expected/actual are not available
            logger.logAssertionFailure((error as Error).message);
          } else {
            logger.logError(`Error in step "${step.name}": ${error}`);
          }
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
      if (isAssertionError(error)) {
        // Already printed in full inside the step block: keep this to one line
        const e = error as Error & { assertionMessage?: string };
        const summary = e.assertionMessage ?? e.message.split("\n")[0];
        logger.logError(
          `Error in scenario "${this.scenarioName}": ${e.name}: ${summary}`,
        );
      } else {
        logger.logError(`Error in scenario "${this.scenarioName}": ${error}`);
      }
      throw error;
    }
  }
}
