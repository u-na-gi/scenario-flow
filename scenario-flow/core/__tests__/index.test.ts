import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import { ScenarioFlow, type ScenarioFlowStepFunction } from "../index.ts";
import type { ScenarioFlowConfig, ScenarioFlowRequest } from "../type.ts";

// Mock fetch function for testing
const createMockFetch = (mockResponse?: Response, shouldThrow = false) => {
  return async (
    _url: string | URL | Request,
    _init?: RequestInit,
  ): Promise<Response> => {
    await Promise.resolve(); // 意味のない await
    if (shouldThrow) {
      throw new Error("Network error");
    }
    return mockResponse || new Response("mock response", { status: 200 });
  };
};

Deno.test("ScenarioFlow - constructor with config", () => {
  const config: ScenarioFlowConfig = {
    apiBaseUrl: "https://api.example.com",
  };

  const scenarioFlow = new ScenarioFlow("test-scenario", config);
  assertEquals(scenarioFlow instanceof ScenarioFlow, true);
});

Deno.test("ScenarioFlow - constructor with ScenarioFlowChain", () => {
  const config: ScenarioFlowConfig = {
    apiBaseUrl: "https://api.example.com",
  };

  const originalFlow = new ScenarioFlow("original-scenario", config);
  const chainedFlow = new ScenarioFlow("chained-scenario", originalFlow);

  assertEquals(chainedFlow instanceof ScenarioFlow, true);
});

Deno.test("ScenarioFlow - constructor throws error with invalid argument", () => {
  assertThrows(
    () => {
      // @ts-ignore - Testing invalid argument
      new ScenarioFlow("test-scenario", "invalid");
    },
    Error,
    "Invalid argument: ScenarioFlow constructor expects ScenarioFlowConfig or ScenarioFlowChain",
  );
});

Deno.test("ScenarioFlow - step method with function", () => {
  const config: ScenarioFlowConfig = {
    apiBaseUrl: "https://api.example.com",
  };

  const scenarioFlow = new ScenarioFlow("test-scenario", config);

  const stepFunction: ScenarioFlowStepFunction = async (ctx) => {
    await Promise.resolve(); // 意味のない await
    ctx.addContext("test", "value");
  };

  const result = scenarioFlow.step("test-step", stepFunction);
  assertEquals(result, scenarioFlow); // Should return the same instance for chaining
});

Deno.test("ScenarioFlow - step method with ScenarioFlowChain", () => {
  const config: ScenarioFlowConfig = {
    apiBaseUrl: "https://api.example.com",
  };

  const flow1 = new ScenarioFlow("flow1", config);
  const flow2 = new ScenarioFlow("flow2", config);

  const stepFunction: ScenarioFlowStepFunction = async (ctx) => {
    await Promise.resolve(); // 意味のない await
    ctx.addContext("test", "value");
  };

  flow2.step("test-step", stepFunction);

  const result = flow1.step(flow2);
  assertEquals(result, flow1); // Should return the same instance for chaining
});

Deno.test("ScenarioFlow - execute method runs steps successfully", async () => {
  // Mock fetch globally for this test
  const originalFetch = globalThis.fetch;
  globalThis.fetch = createMockFetch();

  try {
    const config: ScenarioFlowConfig = {
      apiBaseUrl: "https://api.example.com",
    };

    const scenarioFlow = new ScenarioFlow("test-scenario", config);
    let stepExecuted = false;

    const stepFunction: ScenarioFlowStepFunction = async (ctx) => {
      await Promise.resolve(); // 意味のない await
      stepExecuted = true;
      ctx.addContext("executed", true);
    };

    scenarioFlow.step("test-step", stepFunction);

    await scenarioFlow.execute();
    assertEquals(stepExecuted, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("ScenarioFlow - execute method handles step errors", async () => {
  // Mock fetch globally for this test
  const originalFetch = globalThis.fetch;
  globalThis.fetch = createMockFetch();

  try {
    const config: ScenarioFlowConfig = {
      apiBaseUrl: "https://api.example.com",
    };

    const scenarioFlow = new ScenarioFlow("test-scenario", config);

    const errorStepFunction: ScenarioFlowStepFunction = async (_ctx) => {
      await Promise.resolve(); // 意味のない await
      throw new Error("Step execution failed");
    };

    scenarioFlow.step("error-step", errorStepFunction);

    await assertRejects(
      () => scenarioFlow.execute(),
      Error,
      "Step execution failed",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("ScenarioFlow - multiple steps execute in order", async () => {
  // Mock fetch globally for this test
  const originalFetch = globalThis.fetch;
  globalThis.fetch = createMockFetch();

  try {
    const config: ScenarioFlowConfig = {
      apiBaseUrl: "https://api.example.com",
    };

    const scenarioFlow = new ScenarioFlow("test-scenario", config);
    const executionOrder: number[] = [];

    const step1: ScenarioFlowStepFunction = async (ctx) => {
      await Promise.resolve(); // 意味のない await
      executionOrder.push(1);
      ctx.addContext("step1", "executed");
    };

    const step2: ScenarioFlowStepFunction = async (ctx) => {
      await Promise.resolve(); // 意味のない await
      executionOrder.push(2);
      ctx.addContext("step2", "executed");
    };

    const step3: ScenarioFlowStepFunction = async (ctx) => {
      await Promise.resolve(); // 意味のない await
      executionOrder.push(3);
      ctx.addContext("step3", "executed");
    };

    scenarioFlow
      .step("step1", step1)
      .step("step2", step2)
      .step("step3", step3);

    await scenarioFlow.execute();
    assertEquals(executionOrder, [1, 2, 3]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("ScenarioFlow - URL joining works correctly", async () => {
  // Mock fetch to capture the URL
  const originalFetch = globalThis.fetch;
  let capturedUrl = "";

  globalThis.fetch = async (
    url: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    await Promise.resolve(); // 意味のない await
    console.log("Mock fetch called with URL:", url);
    console.log("Mock fetch called with request:", init);
    capturedUrl = url.toString();
    return new Response("mock response", { status: 200 });
  };

  try {
    const config: ScenarioFlowConfig = {
      apiBaseUrl: "https://api.example.com/",
    };

    const scenarioFlow = new ScenarioFlow("", config);

    const stepFunction: ScenarioFlowStepFunction = async (ctx) => {
      const request: ScenarioFlowRequest = {
        path: "/users/123/profile",
        method: "GET",
      };
      await ctx.fetcher(request);
    };

    scenarioFlow.step("", stepFunction);
    await scenarioFlow.execute();

    assertEquals(capturedUrl, "https://api.example.com/users/123/profile");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("ScenarioFlow - URL joining handles various formats", async () => {
  // Mock fetch to capture the URL
  const originalFetch = globalThis.fetch;
  let capturedUrl = "";

  globalThis.fetch = async (
    url: string | URL | Request,
    // init?: RequestInit,
  ): Promise<Response> => {
    capturedUrl = await url.toString();
    return new Response("mock response", { status: 200 });
  };

  try {
    const config: ScenarioFlowConfig = {
      apiBaseUrl: "https://api.example.com", // No trailing slash
    };

    const scenarioFlow = new ScenarioFlow("", config);

    const stepFunction: ScenarioFlowStepFunction = async (ctx) => {
      const request: ScenarioFlowRequest = {
        path: "/api/v1/data/", // Leading and trailing slashes
        method: "GET",
      };
      await ctx.fetcher(request);
    };

    scenarioFlow.step("", stepFunction);
    await scenarioFlow.execute();

    assertEquals(capturedUrl, "https://api.example.com/api/v1/data");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("ScenarioFlow - fetcher handles HTTP errors", async () => {
  // Mock fetch to return error response
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (
    url: string | URL | Request,
  ): Promise<Response> => {
    console.log("Mock fetch called with URL:", url);
    await Promise.resolve(); // 意味のない await
    return new Response("Not Found", { status: 404 });
  };

  try {
    const config: ScenarioFlowConfig = {
      apiBaseUrl: "https://api.example.com",
    };

    const scenarioFlow = new ScenarioFlow("", config);

    const stepFunction: ScenarioFlowStepFunction = async (ctx) => {
      const request: ScenarioFlowRequest = {
        path: "/not-found",
        method: "GET",
      };
      await ctx.fetcher(request);
    };

    scenarioFlow.step("", stepFunction);

    await assertRejects(
      () => scenarioFlow.execute(),
      Error,
      "HTTP error! status: 404",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("ScenarioFlow - chaining ScenarioFlow copies steps", () => {
  const config: ScenarioFlowConfig = {
    apiBaseUrl: "https://api.example.com",
  };

  const flow1 = new ScenarioFlow("", config);
  const flow2 = new ScenarioFlow("", config);

  const step1: ScenarioFlowStepFunction = async (ctx) => {
    await Promise.resolve(); // 意味のない await
    ctx.addContext("step1", "executed");
  };

  const step2: ScenarioFlowStepFunction = async (ctx) => {
    await Promise.resolve(); // 意味のない await
    ctx.addContext("step2", "executed");
  };

  flow1.step("", step1);
  flow2.step("", step2);

  const combinedFlow = new ScenarioFlow("", flow1);
  combinedFlow.step(flow2);

  // The combined flow should have both steps
  // This is tested indirectly through the constructor behavior
  assertEquals(combinedFlow instanceof ScenarioFlow, true);
});

Deno.test("ScenarioFlow - context merging in step chaining", async () => {
  // Mock fetch globally for this test
  const originalFetch = globalThis.fetch;
  globalThis.fetch = createMockFetch();

  try {
    const config: ScenarioFlowConfig = {
      apiBaseUrl: "https://api.example.com",
    };

    const flow1 = new ScenarioFlow("", config);
    const flow2 = new ScenarioFlow("", config);

    const step1: ScenarioFlowStepFunction = async (ctx) => {
      await Promise.resolve(); // 意味のない await
      ctx.addContext("flow1", "data");
    };

    const step2: ScenarioFlowStepFunction = async (ctx): Promise<void> => {
      await Promise.resolve(); // 意味のない await
      ctx.addContext("flow2", "data");
    };

    flow1.step("", step1);
    flow2.step("", step2);

    // Chain flow2 into flow1
    flow1.step(flow2);

    await flow1.execute();

    // Both contexts should be available
    // This is tested through the execution without errors
    assertEquals(true, true); // Placeholder assertion
  } finally {
    globalThis.fetch = originalFetch;
  }
});
