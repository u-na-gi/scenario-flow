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
 * const scenario = new ScenarioFlow("User Login Flow", config);
 * 
 * await scenario
 *   .step("Login user", async (ctx) => {
 *     const response = await ctx.fetcher({
 *       path: "/auth/login",
 *       method: "POST",
 *       body: JSON.stringify({ email: "user@example.com", password: "password123" })
 *     });
 *     const data = await response.json();
 *     ctx.addContext("authToken", data.token);
 *   })
 *   .step("Get user profile", async (ctx) => {
 *     const token = ctx.getContext<string>("authToken");
 *     const response = await ctx.fetcher({
 *       path: "/user/profile",
 *       headers: { "Authorization": `Bearer ${token}` }
 *     });
 *   })
 *   .execute();
 * ```
 * 
 * @module
 */

// Re-export everything from core modules
export * from "./core/index.ts";
export * from "./core/context.ts";
export * from "./core/type.ts";
export * from "./core/logger.ts";
