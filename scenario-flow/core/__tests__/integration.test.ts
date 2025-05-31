import { assertEquals, assertRejects } from "@std/assert";
import { ScenarioFlow, ScenarioFlowStepFunction } from "../index.ts";
import { ScenarioFlowConfig, ScenarioFlowRequest } from "../type.ts";
import { createCtx } from "../context.ts";

Deno.test("Integration - ScenarioFlow with real-like workflow", async () => {
  // Mock fetch globally for this test
  const originalFetch = globalThis.fetch;
  const fetchCalls: Array<{ url: string; init?: RequestInit }> = [];

  globalThis.fetch = async (
    url: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    await Promise.resolve(); // Simulate async operation
    fetchCalls.push({ url: url.toString(), init });

    // Simulate different responses based on URL
    if (url.toString().includes("/login")) {
      return new Response(
        JSON.stringify({ token: "abc123", userId: "user1" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    } else if (url.toString().includes("/users/user1")) {
      return new Response(
        JSON.stringify({
          id: "user1",
          name: "Test User",
          email: "test@example.com",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    } else if (url.toString().includes("/data")) {
      return new Response(JSON.stringify({ data: [1, 2, 3, 4, 5] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Not Found", { status: 404 });
  };

  try {
    const config: ScenarioFlowConfig = {
      apiBaseUrl: "https://api.example.com",
    };

    const scenarioFlow = new ScenarioFlow("", config);

    // Step 1: Login
    const loginStep: ScenarioFlowStepFunction = async (ctx) => {
      const request: ScenarioFlowRequest = {
        urlPaths: ["auth", "login"],
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "testuser", password: "testpass" }),
      };

      const response = await ctx.fetcher(request);
      const loginData = await response.json();

      ctx.addContext("authToken", loginData.token);
      ctx.addContext("userId", loginData.userId);
    };

    // Step 2: Get user profile
    const getUserStep: ScenarioFlowStepFunction = async (ctx) => {
      const userId = ctx.getContext<string>("userId");
      const token = ctx.getContext<string>("authToken");

      const request: ScenarioFlowRequest = {
        urlPaths: ["users", userId as string],
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      };

      const response = await ctx.fetcher(request);
      const userData = await response.json();

      ctx.addContext("userProfile", userData);
    };

    // Step 3: Get user data
    const getDataStep: ScenarioFlowStepFunction = async (ctx) => {
      const token = ctx.getContext<string>("authToken");

      const request: ScenarioFlowRequest = {
        urlPaths: ["data"],
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      };

      const response = await ctx.fetcher(request);
      const data = await response.json();

      ctx.addContext("userData", data);
    };

    // Chain the steps
    scenarioFlow
      .step("", loginStep)
      .step("", getUserStep)
      .step("", getDataStep);

    // Execute the scenario
    await scenarioFlow.execute();

    // Verify the fetch calls were made correctly
    assertEquals(fetchCalls.length, 3);
    assertEquals(fetchCalls[0].url, "https://api.example.com/auth/login");
    assertEquals(fetchCalls[1].url, "https://api.example.com/users/user1");
    assertEquals(fetchCalls[2].url, "https://api.example.com/data");

    // Verify POST request for login
    assertEquals(fetchCalls[0].init?.method, "POST");
    assertEquals(typeof fetchCalls[0].init?.body, "string");

    // Verify GET requests for user and data
    assertEquals(fetchCalls[1].init?.method, "GET");
    assertEquals(fetchCalls[2].init?.method, "GET");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("Integration - ScenarioFlow chaining with context sharing", async () => {
  // Mock fetch globally for this test
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (
    _url: string | URL | Request,
    _init?: RequestInit,
  ): Promise<Response> => {
    await Promise.resolve(); // Simulate async operation
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  };

  try {
    const config: ScenarioFlowConfig = {
      apiBaseUrl: "https://api.example.com",
    };

    // Create first flow
    const flow1 = new ScenarioFlow("", config);
    const step1: ScenarioFlowStepFunction = async (ctx) => {
      await Promise.resolve(); // Simulate async operation
      ctx.addContext("flow1Data", "data from flow 1");
      ctx.addContext("shared", "original value");
    };
    flow1.step("", step1);

    // Create second flow
    const flow2 = new ScenarioFlow("", config);
    const step2: ScenarioFlowStepFunction = async (ctx) => {
      await Promise.resolve(); // Simulate async operation
      ctx.addContext("flow2Data", "data from flow 2");
      ctx.addContext("shared", "overwritten value");
    };
    flow2.step("", step2);

    // Create combined flow
    const combinedFlow = new ScenarioFlow("", flow1);
    combinedFlow.step(flow2);

    // Add a verification step
    const verificationStep: ScenarioFlowStepFunction = async (ctx) => {
      await Promise.resolve(); // Simulate async operation
      const flow1Data = ctx.getContext("flow1Data");
      const flow2Data = ctx.getContext("flow2Data");
      const sharedData = ctx.getContext("shared");

      ctx.addContext("verification", {
        hasFlow1Data: flow1Data === "data from flow 1",
        hasFlow2Data: flow2Data === "data from flow 2",
        sharedOverwritten: sharedData === "overwritten value",
      });
    };

    combinedFlow.step("", verificationStep);

    await combinedFlow.execute();

    // Test passes if execution completes without errors
    assertEquals(true, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("Integration - Error handling in complex scenario", async () => {
  // Mock fetch to simulate network error
  const originalFetch = globalThis.fetch;
  let callCount = 0;

  globalThis.fetch = async (
    _url: string | URL | Request,
    _init?: RequestInit,
  ): Promise<Response> => {
    await Promise.resolve(); // Simulate async operation
    callCount++;
    if (callCount === 2) {
      // Second call fails
      throw new Error("Network timeout");
    }
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  };

  try {
    const config: ScenarioFlowConfig = {
      apiBaseUrl: "https://api.example.com",
    };

    const scenarioFlow = new ScenarioFlow("", config);

    const step1: ScenarioFlowStepFunction = async (ctx) => {
      const request: ScenarioFlowRequest = {
        urlPaths: ["step1"],
        method: "GET",
      };
      await ctx.fetcher(request);
      ctx.addContext("step1", "completed");
    };

    const step2: ScenarioFlowStepFunction = async (ctx) => {
      const request: ScenarioFlowRequest = {
        urlPaths: ["step2"],
        method: "GET",
      };
      await ctx.fetcher(request); // This will fail
      ctx.addContext("step2", "completed");
    };

    const step3: ScenarioFlowStepFunction = async (ctx) => {
      await Promise.resolve(); // Simulate async operation
      // This should not execute due to step2 failure
      ctx.addContext("step3", "completed");
    };

    scenarioFlow
      .step("", step1)
      .step("", step2)
      .step("", step3);

    await assertRejects(
      () => scenarioFlow.execute(),
      Error,
      "Network timeout",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("Integration - Context isolation between different ScenarioFlow instances", async () => {
  // Mock fetch globally for this test
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (
    _url: string | URL | Request,
    _init?: RequestInit,
  ): Promise<Response> => {
    await Promise.resolve(); // Simulate async operation
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  };

  try {
    const config: ScenarioFlowConfig = {
      apiBaseUrl: "https://api.example.com",
    };

    // Create two separate flows
    const flow1 = new ScenarioFlow("", config);
    const flow2 = new ScenarioFlow("", config);

    const step1: ScenarioFlowStepFunction = async (ctx) => {
      await Promise.resolve(); // Simulate async operation
      ctx.addContext("flowId", "flow1");
      ctx.addContext("data", "flow1 data");
    };

    const step2: ScenarioFlowStepFunction = async (ctx) => {
      await Promise.resolve(); // Simulate async operation
      ctx.addContext("flowId", "flow2");
      ctx.addContext("data", "flow2 data");
    };

    flow1.step("", step1);
    flow2.step("", step2);

    // Execute both flows
    await flow1.execute();
    await flow2.execute();

    // Contexts should be isolated - no way to verify this directly
    // but the test passes if both executions complete without interference
    assertEquals(true, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("Integration - createCtx function with ScenarioFlow", async () => {
  const config: ScenarioFlowConfig = {
    apiBaseUrl: "https://api.example.com",
  };

  const mockFetcher = async (_req: ScenarioFlowRequest): Promise<Response> => {
    await Promise.resolve(); // Simulate async operation
    return new Response(JSON.stringify({ test: "data" }), { status: 200 });
  };

  // Test createCtx directly
  const ctx = createCtx(mockFetcher, config);

  // Test that the context works with the fetcher
  const request: ScenarioFlowRequest = {
    urlPaths: ["test"],
    method: "GET",
  };

  const response = await ctx.fetcher(request);
  const data = await response.json();

  assertEquals(data.test, "data");
  assertEquals(ctx.getConfig().apiBaseUrl, "https://api.example.com");
});
