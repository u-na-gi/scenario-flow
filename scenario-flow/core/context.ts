import type {
  ResolvedScenarioFlowConfig,
  ScenarioFlowRequest,
} from "./type.ts";
import { assert, type ScenarioAssert } from "./assert.ts";

/**
 * Default (untyped) context shape: any string key, unknown value.
 * A scenario that declares no context type behaves exactly like this.
 */
export type ContextRecord = Record<string, unknown>;

/**
 * `true` when `Ctx` is an untyped context (has a string index signature, like
 * the default `Record<string, unknown>`), `false` when the keys are declared
 * explicitly. Building block for {@link ContextKey}, {@link TypedContextKey}
 * and {@link InheritedContext}.
 */
export type IsUntypedContext<Ctx> = string extends keyof Ctx ? true : false;

/**
 * Keys accepted by `setContext` / `getContext`.
 * Untyped context: any string. Typed context: only the declared keys.
 */
export type ContextKey<Ctx> = IsUntypedContext<Ctx> extends true ? string
  : keyof Ctx & string;

/**
 * Keys that are known at the type level. Resolves to `never` for an untyped
 * context so that the key-typed `getContext` overload is skipped there.
 */
export type TypedContextKey<Ctx> = IsUntypedContext<Ctx> extends true ? never
  : keyof Ctx & string;

/**
 * Value type stored under key `K` of `Ctx` (`unknown` for an untyped context).
 */
export type ContextValue<Ctx, K> = K extends keyof Ctx ? Ctx[K] : unknown;

/**
 * Context type of a scenario built on top of a parent scenario.
 *
 * - untyped parent: the child's own type wins (`Own`)
 * - untyped child: the parent's type is inherited (`Parent`)
 * - both typed: `Parent & Own`
 */
export type InheritedContext<Parent, Own> = IsUntypedContext<Parent> extends
  true ? Own
  : IsUntypedContext<Own> extends true ? Parent
  : Parent & Own;

/**
 * Context object passed to each scenario step.
 * Provides HTTP client and shared state management.
 *
 * @typeParam Ctx - Shape of the values stored in the context. Defaults to
 * an untyped record (`Record<string, unknown>`).
 */
export interface ScenarioFlowContext<Ctx extends object = ContextRecord> {
  /** HTTP client for making requests */
  fetcher: (req: ScenarioFlowRequest) => Promise<Response>;
  /** Shared context data between steps */
  customContext: Partial<Ctx>;
  /**
   * Store data in the context for use in later steps.
   * @param key - Context key
   * @param value - Value to store
   */
  setContext<K extends ContextKey<Ctx>>(
    key: K,
    value: ContextValue<Ctx, K>,
  ): void;
  /**
   * Store data in the context for use in later steps.
   * @deprecated Use {@link ScenarioFlowContext.setContext} instead.
   * @param key - Context key
   * @param value - Value to store
   */
  addContext<K extends ContextKey<Ctx>>(
    key: K,
    value: ContextValue<Ctx, K>,
  ): void;
  /**
   * Retrieve data from the context (typed context: the declared value type).
   * @param key - Context key
   * @returns The stored value or undefined
   */
  getContext<K extends TypedContextKey<Ctx>>(key: K): Ctx[K] | undefined;
  /**
   * Retrieve data from the context with an explicit value type.
   * @param key - Context key
   * @returns The stored value or undefined
   */
  getContext<T = unknown>(key: ContextKey<Ctx>): T | undefined;
  /**
   * Merge another context's values into this one.
   *
   * This is a **shallow snapshot**: top-level keys are copied (the other
   * context's values win on conflicts), but nested objects are not cloned, so
   * a nested object stored in `ctx` is afterwards shared by both contexts.
   * Values are deliberately not deep-cloned because they may not be cloneable.
   * @param ctx - Context to merge
   */
  merge<Other extends object>(ctx: ScenarioFlowContext<Other>): void;
  /**
   * Get the scenario configuration.
   * @returns The configuration object with `apiBaseUrl` resolved to a string
   */
  getConfig(): ResolvedScenarioFlowConfig;
  /**
   * Assertion helpers. Failures throw `ScenarioAssertionError` and are
   * printed with expected/actual values inside the step log.
   * @example ctx.assert.equal(res.status, 200, "login succeeds");
   */
  assert: ScenarioAssert;
}

class ScenarioFlowContextImple<Ctx extends object>
  implements ScenarioFlowContext<Ctx> {
  fetcher: (req: ScenarioFlowRequest) => Promise<Response>;
  customContext: Partial<Ctx>;
  private config: ResolvedScenarioFlowConfig;

  constructor(
    fetcher: (req: ScenarioFlowRequest) => Promise<Response>,
    config: ResolvedScenarioFlowConfig,
  ) {
    this.fetcher = fetcher;
    this.customContext = {};
    this.config = config;
  }

  getConfig(): ResolvedScenarioFlowConfig {
    return this.config;
  }

  private get store(): ContextRecord {
    return this.customContext as ContextRecord;
  }

  setContext<K extends ContextKey<Ctx>>(
    key: K,
    value: ContextValue<Ctx, K>,
  ): void {
    this.store[key as string] = value;
  }

  /** @deprecated Use {@link setContext} instead. */
  addContext<K extends ContextKey<Ctx>>(
    key: K,
    value: ContextValue<Ctx, K>,
  ): void {
    this.setContext(key, value);
  }

  getContext<K extends TypedContextKey<Ctx>>(key: K): Ctx[K] | undefined;
  getContext<T = unknown>(key: ContextKey<Ctx>): T | undefined;
  getContext(key: string): unknown {
    return this.store[key];
  }

  merge<Other extends object>(ctx: ScenarioFlowContext<Other>): void {
    this.customContext = {
      ...this.customContext,
      ...(ctx.customContext as ContextRecord),
    } as Partial<Ctx>;
  }

  assert: ScenarioAssert = assert;
}

/**
 * Create a new scenario context.
 * @param fetcher - HTTP client function
 * @param config - Resolved scenario configuration (see `resolveConfig`);
 *   it is stored as-is, no further resolution happens here
 * @returns New context instance
 */
export const createCtx = function <Ctx extends object = ContextRecord>(
  fetcher: (req: ScenarioFlowRequest) => Promise<Response>,
  config: ResolvedScenarioFlowConfig,
): ScenarioFlowContext<Ctx> {
  return new ScenarioFlowContextImple<Ctx>(fetcher, config);
};
