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
import { loadContextFixture, writeContextOut } from "./fixture.ts";

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
   * Mark this scenario as run-once: its steps are executed at most once per
   * process, no matter how many scenarios inherit it. See
   * {@link ScenarioFlow.once} for the exact behaviour.
   * @returns The chain for method chaining
   */
  once(): ScenarioFlowChain<Ctx>;
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
 * Merge a plain record into a context (shallow; the record's values win),
 * with the same semantics as `ctx.merge(otherCtx)`. Goes through
 * `setContext` so that a write-recording proxy (see {@link recordWrites})
 * sees the keys.
 */
function mergeRecord<Ctx extends object>(
  ctx: ScenarioFlowContext<Ctx>,
  record: ContextRecord,
): void {
  for (const [key, value] of Object.entries(record)) {
    ctx.setContext(key as never, value as never);
  }
}

/**
 * Wrap a context so that every key written through `setContext`,
 * `addContext` or `merge` is added to `written`. All other members are
 * forwarded to `ctx` unchanged (the proxy shares its `customContext`).
 */
function recordWrites<Ctx extends object>(
  ctx: ScenarioFlowContext<Ctx>,
  written: Set<string>,
): ScenarioFlowContext<Ctx> {
  const setContext = (key: string, value: unknown) => {
    written.add(key);
    ctx.setContext(key as never, value as never);
  };
  const merge = (other: ScenarioFlowContext<object>) => {
    for (const key of Object.keys(other.customContext)) written.add(key);
    ctx.merge(other);
  };
  return new Proxy(ctx, {
    get(target, prop, receiver) {
      if (prop === "setContext" || prop === "addContext") return setContext;
      if (prop === "merge") return merge;
      return Reflect.get(target, prop, receiver);
    },
  });
}

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
  /** Set by {@link ScenarioFlow.once}. */
  private runOnce = false;
  /**
   * Result of the single run of a run-once scenario: the values its steps
   * wrote, as a shallow snapshot. Holds the in-flight promise while the run
   * is in progress so that concurrent children share it; cleared when the
   * run fails so that the next child retries.
   */
  private onceResult?: Promise<ContextRecord>;
  /** `true` once {@link ScenarioFlow.onceResult} has resolved. */
  private onceDone = false;
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
      // Opt-in run-level fixture (SF_CONTEXT_FILE, see `sfcli --setup`):
      // only top-level scenarios load it; children copy their parent's ctx.
      const fixture = loadContextFixture();
      if (fixture) {
        mergeRecord(this.ctx, fixture);
      }
      return;
    }

    if (arg instanceof ScenarioFlow) {
      // The child gets its own config, fetcher and context object. Sharing the
      // parent's ctx by reference made sibling scenarios leak values into each
      // other and into the parent (#8). The parent's current values are copied
      // as a snapshot; the parent's steps run again inside this scenario's
      // execute() against this scenario's ctx (or once per process, when the
      // parent is marked with `.once()`).
      this.config = { ...arg.config };
      const fetcher = this.createFetcher();
      this.ctx = createCtx(fetcher, this.config);
      this.ctx.merge(arg.ctx);
      this.steps = arg.inheritedSteps() as NamedStep<Ctx>[];
      return;
    }

    throw new Error(
      "Invalid argument: ScenarioFlow constructor expects ScenarioFlowConfig or ScenarioFlowChain",
    );
  }

  /**
   * Build the `ctx.fetcher` function bound to this scenario's config: it
   * joins `path` with `apiBaseUrl`, logs request and response, and enforces
   * `expectStatus` / `throwOnError`.
   */
  private createFetcher(): (req: ScenarioFlowRequest) => Promise<Response> {
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

  /**
   * Join a request path with `apiBaseUrl`, collapsing the slashes between
   * them.
   */
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
      this.steps.push(...(nameOrParent.inheritedSteps() as NamedStep<Ctx>[]));
      this.ctx.merge(nameOrParent.ctx);
      return this as unknown as ScenarioFlowChain<
        InheritedContext<Ctx, Parent>
      >;
    }

    throw new Error("Invalid step arguments");
  }

  /**
   * Mark this scenario as run-once.
   *
   * By default a parent's steps are copied into every scenario that inherits
   * it and run again inside each child's `execute()`. After `once()`, a child
   * instead gets a single synthetic step named `once: <parent name>` that
   * runs the parent's steps the first time it is reached in the process and,
   * on every later run (by any child, or by `execute()` on the parent
   * itself), only merges a shallow snapshot of the values those steps wrote
   * into the child's context and logs `(cached, skipped)`.
   *
   * - The snapshot contains the keys the parent's steps wrote through
   *   `setContext` / `addContext` / `merge` (same-value writes included) and
   *   keys whose value changed during the run. Mutating an object the child
   *   already held in place (`ctx.getContext("user").name = "x"`) is not
   *   detected and is not carried to other children.
   * - Children that reach the step while the first run is still in flight
   *   wait for it and then merge the same snapshot, logging
   *   `waited for in-flight run` (the run is never duplicated in one
   *   process).
   * - A failing run is not cached: the error is rethrown and the next child
   *   runs the parent's steps again.
   * - The cache is per parent instance and per process. Separate `deno run`
   *   processes (one per file under `sfcli`) do not share it; use
   *   `sfcli --setup` for that.
   * - Nesting composes: if a run-once grandparent is inherited by the parent,
   *   the parent's step list contains the grandparent's synthetic step, so
   *   the grandparent still runs at most once.
   *
   * Call `once()` before creating children: a child created earlier keeps a
   * plain copy of the steps. The synthetic step refers to the parent, so it
   * runs the parent's step list as it is at execution time.
   *
   * @example
   * ```typescript
   * const login = new ScenarioFlow<{ token: string }>("Login", config)
   *   .step("Authenticate", async (ctx) => {
   *     const res = await ctx.fetcher({ path: "/auth/login", method: "POST" });
   *     ctx.setContext("token", (await res.json()).token);
   *   })
   *   .once();
   *
   * const a = login.extend("A").step("a", async (ctx) => {
   *   console.log(ctx.getContext("token"));
   * });
   * const b = login.extend("B").step("b", async (ctx) => {
   *   console.log(ctx.getContext("token"));
   * });
   * await a.execute(); // runs Authenticate
   * await b.execute(); // merges the cached token; Authenticate is skipped
   * ```
   * @returns This scenario for method chaining
   */
  once(): this {
    this.runOnce = true;
    return this;
  }

  /**
   * Steps a child scenario receives when it inherits this scenario: a copy
   * of the step list, or a single synthetic step when this scenario is
   * marked with {@link ScenarioFlow.once}.
   */
  private inheritedSteps(): NamedStep<Ctx>[] {
    if (!this.runOnce) {
      return [...this.steps];
    }
    return [{
      name: `once: ${this.scenarioName}`,
      fn: (ctx) => this.runOnceInto(ctx, true),
    }];
  }

  /**
   * Run this scenario's steps against `ctx` at most once per process.
   * Later calls (and concurrent callers) merge the snapshot of the values
   * written by the first run into `ctx` instead.
   * @param ctx - Context to run against (a child's, or this scenario's own)
   * @param nested - `true` when called from inside a child's step: the
   *   parent's steps are then reported as info lines instead of step blocks
   */
  private async runOnceInto(
    ctx: ScenarioFlowContext<Ctx>,
    nested: boolean,
  ): Promise<void> {
    if (this.onceResult) {
      const waited = !this.onceDone;
      const snapshot = await this.onceResult;
      mergeRecord(ctx, snapshot);
      logger.logInfo(
        waited
          ? `"${this.scenarioName}" waited for in-flight run (shared, skipped)`
          : `"${this.scenarioName}" already ran (cached, skipped)`,
      );
      return;
    }

    const inFlight = (async () => {
      // Keep only what the parent's steps wrote, so values a child already
      // held before the parent ran do not leak into its siblings. Writes
      // through setContext/addContext/merge are recorded explicitly (this
      // catches same-value writes); a value diff on top catches direct
      // assignments to ctx.customContext. In-place mutation of an object the
      // child inherited is not detected.
      const written = new Set<string>();
      const before = { ...(ctx.customContext as ContextRecord) };
      await this.runStepsInto(recordWrites(ctx, written), nested);
      const after = ctx.customContext as ContextRecord;
      const snapshot: ContextRecord = {};
      for (const [key, value] of Object.entries(after)) {
        if (written.has(key) || !(key in before) || before[key] !== value) {
          snapshot[key] = value;
        }
      }
      return snapshot;
    })();
    this.onceResult = inFlight;

    try {
      await inFlight;
      this.onceDone = true;
    } catch (error) {
      if (this.onceResult === inFlight) {
        this.onceResult = undefined;
      }
      throw error;
    }
  }

  /**
   * Run this scenario's steps in order against `ctx`.
   * @param ctx - Context passed to every step
   * @param nested - `true` when running inside another scenario's step (a
   *   run-once parent): each step is then announced with an info line, and
   *   errors propagate to the enclosing step, which logs them
   */
  private async runStepsInto(
    ctx: ScenarioFlowContext<Ctx>,
    nested: boolean,
  ): Promise<void> {
    for (const step of this.steps) {
      if (nested) {
        logger.logInfo(`"${this.scenarioName}" > ${step.name}`);
        await step.fn(ctx);
        continue;
      }

      logger.startStep(step.name);
      try {
        await step.fn(ctx);
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

  /**
   * Run the scenario inside a scenario log block (`startScenario` /
   * `endScenario`). Errors propagate to {@link ScenarioFlow.execute}.
   */
  private async run(): Promise<void> {
    logger.startScenario(this.scenarioName);

    try {
      if (this.runOnce) {
        // Executing a run-once scenario directly populates (or reuses) the
        // same cache that its children use.
        await this.runOnceInto(this.ctx, false);
      } else {
        await this.runStepsInto(this.ctx, false);
      }
    } finally {
      logger.endScenario();
    }
  }

  /**
   * Execute all steps in the scenario.
   * Logs the scenario execution and handles errors appropriately.
   * When `SF_CONTEXT_OUT` is set, the context is written to that file after
   * a successful run (see `sfcli --setup`).
   * @throws Error if any step fails
   */
  async execute(): Promise<void> {
    try {
      await this.run();
      writeContextOut(this.ctx.customContext as ContextRecord);
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
