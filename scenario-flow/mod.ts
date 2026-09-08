/**
 * # scenario-flow
 *
 * A TypeScript library for scenario-based testing and automation that provides
 * a fluent API for building and executing API test scenarios.
 *
 * ## Features
 *
 * - 🔗 **Fluent API**: Chain multiple steps together for readable test scenarios
 * - 📝 **Built-in Logging**: Automatic request/response logging with timing
 * - 🔧 **Context Management**: Share data between steps with built-in context
 * - 🚀 **TypeScript Support**: Full type safety with TypeScript
 * - 🌐 **HTTP Client**: Built-in fetch-based HTTP client with error handling
 *
 * ## Example
 *
 * ```typescript
 * import { ScenarioFlow } from "@u-na-gi/scenario-flow";
 *
 * const config = { apiBaseUrl: "https://api.example.com" };
 *
 * // Declare the context shape to get typed setContext / getContext
 * type LoginCtx = { authToken: string };
 * const scenario = new ScenarioFlow<LoginCtx>("User Login Flow", config);
 *
 * await scenario
 *   .step("Login user", async (ctx) => {
 *     const response = await ctx.fetcher({
 *       path: "/auth/login",
 *       method: "POST",
 *       body: JSON.stringify({ email: "user@example.com", password: "password123" })
 *     });
 *     const data = await response.json();
 *     ctx.setContext("authToken", data.token); // must be a string
 *   })
 *   .step("Get user profile", async (ctx) => {
 *     const token = ctx.getContext("authToken"); // string | undefined
 *     const response = await ctx.fetcher({
 *       path: "/user/profile",
 *       headers: { "Authorization": `Bearer ${token}` }
 *     });
 *   })
 *   .execute();
 * ```
 *
 * Without a type argument the context is untyped (`Record<string, unknown>`):
 * `ctx.getContext<T>(key)` returns `T | undefined`.
 *
 * @module
 */

// Explicit public surface (no `export *`: the core modules also contain
// internal helpers that must not become part of the published API).
export {
  type ContextMarkerArg,
  ScenarioFlow,
  type ScenarioFlowChain,
  type ScenarioFlowParent,
} from "./core/index.ts";
export type {
  ContextKey,
  ContextRecord,
  ContextValue,
  InheritedContext,
  IsUntypedContext,
  ScenarioFlowContext,
  TypedContextKey,
} from "./core/context.ts";
export type {
  ApiBaseUrlOption,
  ResolvedScenarioFlowConfig,
  ScenarioFlowConfig,
  ScenarioFlowRequest,
  ScenarioFlowStepFunction,
} from "./core/type.ts";
export type { ExpectedStatus } from "./core/status.ts";
export { DEFAULT_API_BASE_URL_ENV_KEY, resolveConfig } from "./core/config.ts";
export {
  logger,
  type ScenarioInfo,
  ScenarioLogger,
  type StepInfo,
} from "./core/logger.ts";
export {
  CONTEXT_FILE_ENV_KEY,
  CONTEXT_OUT_ENV_KEY,
  isSerializableContextValue,
  toSerializableContext,
} from "./core/fixture.ts";
export {
  describeResponseBody,
  type DescribeResponseBodyOptions,
  type ResponseBodyLog,
} from "./core/response-body.ts";
export {
  assert,
  isAssertionError,
  type ScenarioAssert,
  ScenarioAssertionError,
} from "./core/assert.ts";
