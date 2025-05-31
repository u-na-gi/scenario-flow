import { assertEquals } from "@std/assert";
import { createCtx } from "../context.ts";
import { ScenarioFlowConfig, ScenarioFlowRequest } from "../type.ts";

Deno.test("ScenarioFlowContext - createCtx creates context correctly", () => {
  const config: ScenarioFlowConfig = {
    apiBaseUrl: "https://api.example.com",
  };

  const mockFetcher = async (_req: ScenarioFlowRequest): Promise<Response> => {
    await Promise.resolve(); // Simulate async operation
    return new Response("test");
  };

  const ctx = createCtx(mockFetcher, config);

  assertEquals(typeof ctx.fetcher, "function");
  assertEquals(typeof ctx.customContext, "object");
  assertEquals(typeof ctx.addContext, "function");
  assertEquals(typeof ctx.getContext, "function");
  assertEquals(typeof ctx.merge, "function");
  assertEquals(typeof ctx.getConfig, "function");
});

Deno.test("ScenarioFlowContext - getConfig returns correct config", () => {
  const config: ScenarioFlowConfig = {
    apiBaseUrl: "https://api.example.com",
  };

  const mockFetcher = async (_req: ScenarioFlowRequest): Promise<Response> => {
    await Promise.resolve(); // Simulate async operation
    return new Response("test");
  };

  const ctx = createCtx(mockFetcher, config);
  const retrievedConfig = ctx.getConfig();

  assertEquals(retrievedConfig, config);
  assertEquals(retrievedConfig.apiBaseUrl, "https://api.example.com");
});

Deno.test("ScenarioFlowContext - addContext and getContext work correctly", () => {
  const config: ScenarioFlowConfig = {
    apiBaseUrl: "https://api.example.com",
  };

  const mockFetcher = async (_req: ScenarioFlowRequest): Promise<Response> => {
    await Promise.resolve(); // Simulate async operation
    return new Response("test");
  };

  const ctx = createCtx(mockFetcher, config);

  // Test adding and getting string value
  ctx.addContext("testKey", "testValue");
  assertEquals(ctx.getContext("testKey"), "testValue");

  // Test adding and getting object value
  const testObject = { name: "test", value: 123 };
  ctx.addContext("objectKey", testObject);
  assertEquals(ctx.getContext("objectKey"), testObject);

  // Test adding and getting number value
  ctx.addContext("numberKey", 42);
  assertEquals(ctx.getContext("numberKey"), 42);

  // Test getting non-existent key
  assertEquals(ctx.getContext("nonExistentKey"), undefined);
});

Deno.test("ScenarioFlowContext - getContext with generic type", () => {
  const config: ScenarioFlowConfig = {
    apiBaseUrl: "https://api.example.com",
  };

  const mockFetcher = async (_req: ScenarioFlowRequest): Promise<Response> => {
    await Promise.resolve(); // Simulate async operation
    return new Response("test");
  };

  const ctx = createCtx(mockFetcher, config);

  interface TestInterface {
    id: number;
    name: string;
  }

  const testData: TestInterface = { id: 1, name: "test" };
  ctx.addContext("typedKey", testData);

  const retrieved = ctx.getContext<TestInterface>("typedKey") as TestInterface;
  assertEquals(retrieved.id, 1);
  assertEquals(retrieved.name, "test");
});

Deno.test("ScenarioFlowContext - merge combines contexts correctly", () => {
  const config: ScenarioFlowConfig = {
    apiBaseUrl: "https://api.example.com",
  };

  const mockFetcher = async (_req: ScenarioFlowRequest): Promise<Response> => {
    await Promise.resolve(); // Simulate async operation
    return new Response("test");
  };

  const ctx1 = createCtx(mockFetcher, config);
  const ctx2 = createCtx(mockFetcher, config);

  // Add different data to each context
  ctx1.addContext("key1", "value1");
  ctx1.addContext("shared", "original");

  ctx2.addContext("key2", "value2");
  ctx2.addContext("shared", "overwritten");

  // Merge ctx2 into ctx1
  ctx1.merge(ctx2);

  // Check that ctx1 now has data from both contexts
  assertEquals(ctx1.getContext("key1"), "value1");
  assertEquals(ctx1.getContext("key2"), "value2");
  // Shared key should be overwritten by ctx2's value
  assertEquals(ctx1.getContext("shared"), "overwritten");
});

Deno.test("ScenarioFlowContext - fetcher function works", async () => {
  const config: ScenarioFlowConfig = {
    apiBaseUrl: "https://api.example.com",
  };

  const mockResponse = new Response("mock response", { status: 200 });
  const mockFetcher = async (req: ScenarioFlowRequest): Promise<Response> => {
    await Promise.resolve(); // Simulate async operation
    assertEquals(req.path, "/test/path");
    return mockResponse;
  };

  const ctx = createCtx(mockFetcher, config);

  const request: ScenarioFlowRequest = {
    path: "/test/path",
    method: "GET",
  };

  const response = await ctx.fetcher(request);
  assertEquals(response, mockResponse);
});

Deno.test("ScenarioFlowContext - customContext is initially empty", () => {
  const config: ScenarioFlowConfig = {
    apiBaseUrl: "https://api.example.com",
  };

  const mockFetcher = async (_req: ScenarioFlowRequest): Promise<Response> => {
    await Promise.resolve(); // Simulate async operation
    return new Response("test");
  };

  const ctx = createCtx(mockFetcher, config);

  assertEquals(Object.keys(ctx.customContext).length, 0);
  assertEquals(ctx.customContext, {});
});

Deno.test("ScenarioFlowContext - context overwrite behavior", () => {
  const config: ScenarioFlowConfig = {
    apiBaseUrl: "https://api.example.com",
  };

  const mockFetcher = async (_req: ScenarioFlowRequest): Promise<Response> => {
    await Promise.resolve(); // Simulate async operation
    return new Response("test");
  };

  const ctx = createCtx(mockFetcher, config);

  // Add initial value
  ctx.addContext("key", "initialValue");
  assertEquals(ctx.getContext("key"), "initialValue");

  // Overwrite with new value
  ctx.addContext("key", "newValue");
  assertEquals(ctx.getContext("key"), "newValue");

  // Overwrite with different type
  ctx.addContext("key", 123);
  assertEquals(ctx.getContext("key"), 123);
});
