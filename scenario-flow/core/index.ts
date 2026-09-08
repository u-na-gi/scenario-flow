import {
  type ContextRecord,
  createCtx,
  type InheritedContext,
  type IsUntypedContext,
  type ScenarioFlowContext,
} from "./context.ts";
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
 *
 * @typeParam Ctx - Shape of the scenario context. Defaults to an untyped
 * record (`Record<string, unknown>`).
 */
export interface ScenarioFlowChain<Ctx extends object = ContextRecord> {
  /**
   * Add a step to the scenario chain.
   * @param name - Descriptive name for the step
   * @param fn - Function to execute for this step
   * @returns The chain for method chaining
   */
  step(name: string, fn: ScenarioFlowStepFunction<Ctx>): ScenarioFlowChain<Ctx>;
  /**
   * Add another scenario chain as a step.
   * The returned chain's context type is widened with the parent's context.
   * @param parent - Another scenario chain to execute
   * @returns The chain for method chaining
   */
  step<Parent extends object>(
    parent: ScenarioFlowChain<Parent>,
  ): ScenarioFlowChain<InheritedContext<Ctx, Parent>>;
  /**
   * Create a new scenario that inherits this chain's steps and context,
   * adding its own context keys `Own` on top (`Ctx & Own`).
   * @param name - Descriptive name for the new scenario
   * @returns A new scenario chain
   */
  extend<Own extends object = ContextRecord>(
    name: string,
  ): ScenarioFlowChain<InheritedContext<Ctx, Own>>;
  /**
   * Execute all steps in the scenario.
   * @returns Promise that resolves when all steps complete
   */
  execute(): Promise<void>;
  /**
   * Type-level marker carrying `Ctx` contravariantly; never assigned at run
   * time. It lets `new ScenarioFlow<Ctx>(name, parent)` check that the
   * declared `Ctx` extends the parent's context type.
   * @internal
   */
  readonly __ctx: (ctx: ContextMarkerArg<Ctx>) => void;
}

/**
 * Parameter type of the contravariant context marker (`__ctx`) on a scenario
 * chain; the marker is never called at run time. For an untyped context this
 * is `object`, so an untyped parent accepts any declared `Ctx` (including
 * interfaces). Kept as a parameter-only alias on purpose: aliasing the whole
 * function type makes TypeScript measure its variance incorrectly.
 */
export type ContextMarkerArg<Ctx extends object> = IsUntypedContext<Ctx> extends
  true ? object
  : Ctx;

/**
 * Shape accepted as a parent scenario when the context type is given
 * explicitly (`new ScenarioFlow<Ctx>(name, parent)`). A
 * {@link ScenarioFlowChain}`<P>` satisfies `ScenarioFlowParent<Ctx>` when
 * `Ctx` extends `P` (e.g. `Ctx = P & Own`), or when `P` is untyped.
 */
export type ScenarioFlowParent<Ctx extends object = ContextRecord> = {
  /** Execute all steps in the scenario. */
  execute(): Promise<void>;
  /** Contravariant context marker, see {@link ScenarioFlowChain.__ctx}. */
  readonly __ctx: (ctx: ContextMarkerArg<Ctx>) => void;
};

// Re-export the type from type.ts
/** Function type for scenario steps */
export type { ScenarioFlowStepFunction } from "./type.ts";

/**
 * Main class for creating and executing test scenarios.
 * Provides a fluent API for building chains of API calls with automatic logging.
 *
 * @typeParam Ctx - Shape of the scenario context. Declare it to get typed
 * `setContext` / `getContext`; omit it for an untyped context.
 *
 * @example
 * ```typescript
 * type LoginCtx = { token: string };
 *
 * const login = new ScenarioFlow<LoginCtx>("Login Flow", { apiBaseUrl: "https://api.example.com" })
 *   .step("Login", async (ctx) => {
 *     const response = await ctx.fetcher({ path: "/auth/login", method: "POST" });
 *     const data = await response.json();
 *     ctx.setContext("token", data.token); // value must be a string
 *   });
 *
 * // Inherit the parent's steps and context, adding own keys
 * const getData = login.extend<{ items: unknown[] }>("Get data")
 *   .step("Fetch", async (ctx) => {
 *     const token = ctx.getContext("token"); // string | undefined
 *     // ...
 *   });
 *
 * await getData.execute();
 * ```
 */
export class ScenarioFlow<Ctx extends object = ContextRecord>
  implements ScenarioFlowChain<Ctx> {
  private scenarioName: string;
  private config: ResolvedScenarioFlowConfig;
  private ctx: ScenarioFlowContext<Ctx>;
  private steps: NamedStep<Ctx>[] = [];
  /**
   * Type-level marker carrying `Ctx` contravariantly; never assigned at run
   * time (see {@link ScenarioFlowChain.__ctx}).
   * @internal
   */
  declare readonly __ctx: (ctx: ContextMarkerArg<Ctx>) => void;

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
   * The context type is inferred from the parent (`ScenarioFlow<ParentCtx>`).
   * To add own keys on top of the parent's, use {@link ScenarioFlow.extend}.
   * @param name - Descriptive name for the scenario
   * @param scenarioFlowChain - Another scenario to chain
   */
  constructor(name: string, scenarioFlowChain: ScenarioFlowChain<Ctx>);
  /**
   * Create a new scenario by chaining another scenario, declaring the context
   * type explicitly: `new ScenarioFlow<ParentCtx & Own>(name, parent)`.
   * The declared `Ctx` must extend the parent's context type (a conflicting or
   * unrelated `Ctx` is a compile error); an untyped parent accepts any `Ctx`.
   * @param name - Descriptive name for the scenario
   * @param scenarioFlowChain - Another scenario to chain
   */
  constructor(name: string, scenarioFlowChain: ScenarioFlowParent<Ctx>);
  constructor(
    name: string,
    arg: ScenarioFlowConfig | ScenarioFlowParent<Ctx>,
  ) {
    this.scenarioName = name;

    if (typeof arg === "object" && "apiBaseUrl" in arg) {
      this.config = resolveConfig(arg);
      const fetcher = this.createFetcher();
      this.ctx = createCtx(fetcher, this.config);
      return;
    }

    if (arg instanceof ScenarioFlow) {
      // The child gets its own config, fetcher and context object. Sharing the
      // parent's ctx by reference made sibling scenarios leak values into each
      // other and into the parent (#8). The parent's current values are copied
      // as a snapshot; the parent's steps run again inside this scenario's
      // execute() against this scenario's ctx.
      this.config = { ...arg.config };
      const fetcher = this.createFetcher();
      this.ctx = createCtx(fetcher, this.config);
      this.ctx.merge(arg.ctx);
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
  step(name: string, fn: ScenarioFlowStepFunction<Ctx>): ScenarioFlowChain<Ctx>;
  /**
   * Add another scenario as a step.
   * The returned chain's context type is widened with the parent's context.
   * @param parent - Another scenario to execute
   * @returns The scenario chain for method chaining
   */
  step<Parent extends object>(
    parent: ScenarioFlowChain<Parent>,
  ): ScenarioFlowChain<InheritedContext<Ctx, Parent>>;
  step<Parent extends object>(
    nameOrParent: string | ScenarioFlowChain<Parent>,
    fn?: ScenarioFlowStepFunction<Ctx>,
  ): ScenarioFlowChain<Ctx> | ScenarioFlowChain<InheritedContext<Ctx, Parent>> {
    if (typeof nameOrParent === "string" && fn) {
      this.steps.push({ name: nameOrParent, fn });
      return this;
    }

    if (nameOrParent instanceof ScenarioFlow) {
      // Step functions only ever receive this scenario's own ctx at run time;
      // the parent's steps are re-typed to this scenario's context.
      this.steps.push(...(nameOrParent.steps as NamedStep<Ctx>[]));
      this.ctx.merge(nameOrParent.ctx);
      return this as unknown as ScenarioFlowChain<
        InheritedContext<Ctx, Parent>
      >;
    }

    throw new Error("Invalid step arguments");
  }

  /**
   * Create a new scenario that inherits this scenario's steps and context,
   * adding its own context keys `Own` on top (`Ctx & Own`).
   * @param name - Descriptive name for the new scenario
   * @returns A new scenario
   */
  extend<Own extends object = ContextRecord>(
    name: string,
  ): ScenarioFlow<InheritedContext<Ctx, Own>> {
    type Child = InheritedContext<Ctx, Own>;
    return new ScenarioFlow<Child>(
      name,
      this as unknown as ScenarioFlowChain<Child>,
    );
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
