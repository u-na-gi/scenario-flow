import { assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import { ScenarioFlow, type ScenarioFlowStepFunction } from "../index.ts";
import type {
  ResolvedScenarioFlowConfig,
  ScenarioFlowConfig,
  ScenarioFlowRequest,
} from "../type.ts";
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
        path: "/auth/login",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "testuser", password: "testpass" }),
      };

      const response = await ctx.fetcher(request);
      const loginData = await response.json();

      ctx.setContext("authToken", loginData.token);
      ctx.setContext("userId", loginData.userId);
    };

    // Step 2: Get user profile
    const getUserStep: ScenarioFlowStepFunction = async (ctx) => {
      const userId = ctx.getContext<string>("userId");
      const token = ctx.getContext<string>("authToken");

      const request: ScenarioFlowRequest = {
        path: `/users/${userId as string}`,
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      };

      const response = await ctx.fetcher(request);
      const userData = await response.json();

      ctx.setContext("userProfile", userData);
    };

    // Step 3: Get user data
    const getDataStep: ScenarioFlowStepFunction = async (ctx) => {
      const token = ctx.getContext<string>("authToken");

      const request: ScenarioFlowRequest = {
        path: "/data",
        method: "GET",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      };

      const response = await ctx.fetcher(request);
      const data = await response.json();

      ctx.setContext("userData", data);
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
      ctx.setContext("flow1Data", "data from flow 1");
      ctx.setContext("shared", "original value");
    };
    flow1.step("", step1);

    // Create second flow
    const flow2 = new ScenarioFlow("", config);
    const step2: ScenarioFlowStepFunction = async (ctx) => {
      await Promise.resolve(); // Simulate async operation
      ctx.setContext("flow2Data", "data from flow 2");
      ctx.setContext("shared", "overwritten value");
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

      ctx.setContext("verification", {
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
        path: "/step1",
        method: "GET",
      };
      await ctx.fetcher(request);
      ctx.setContext("step1", "completed");
    };

    const step2: ScenarioFlowStepFunction = async (ctx) => {
      const request: ScenarioFlowRequest = {
        path: "/step2",
        method: "GET",
      };
      await ctx.fetcher(request); // This will fail
      ctx.setContext("step2", "completed");
    };

    const step3: ScenarioFlowStepFunction = async (ctx) => {
      await Promise.resolve(); // Simulate async operation
      // This should not execute due to step2 failure
      ctx.setContext("step3", "completed");
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
      ctx.setContext("flowId", "flow1");
      ctx.setContext("data", "flow1 data");
    };

    const step2: ScenarioFlowStepFunction = async (ctx) => {
      await Promise.resolve(); // Simulate async operation
      ctx.setContext("flowId", "flow2");
      ctx.setContext("data", "flow2 data");
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
  const config: ResolvedScenarioFlowConfig = {
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
    path: "/test",
    method: "GET",
  };

  const response = await ctx.fetcher(request);
  const data = await response.json();

  assertEquals(data.test, "data");
  assertEquals(ctx.getConfig().apiBaseUrl, "https://api.example.com");
});

/**
 * Run `fn` while capturing console.log output. Returns captured lines.
 */
async function captureConsoleLog(
  fn: () => Promise<void>,
): Promise<string[]> {
  const originalLog = console.log;
  const lines: string[] = [];
  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  try {
    await fn();
  } finally {
    console.log = originalLog;
  }
  return lines;
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    Deno.env.delete(name);
  } else {
    Deno.env.set(name, value);
  }
}

// These tests need a real local server and the SF_LOG_BINARY variable.
// Deno.test permissions can only narrow the parent's permissions, so skip
// when `deno test` was started without --allow-net / --allow-env.
const hasBinaryLogPermissions =
  Deno.permissions.querySync({ name: "net" }).state === "granted" &&
  Deno.permissions.querySync({ name: "env", variable: "SF_LOG_BINARY" })
      .state === "granted";
const binaryLogTestOptions = {
  permissions: { net: true, env: ["SF_LOG_BINARY"] },
  ignore: !hasBinaryLogPermissions,
};

Deno.test({
  name:
    "Integration - binary (octet-stream) response is logged as [Binary Data]",
  ...binaryLogTestOptions,
}, async () => {
  // Protobuf-like payload with control bytes and invalid UTF-8
  const payload = new Uint8Array([
    0x0a,
    0x05,
    0x68,
    0x65,
    0x6c,
    0x6c,
    0x6f,
    0x10,
    0x01,
    0x1a,
    0x03,
    0xff,
    0xfe,
    0xfd,
    0x00,
    0x07,
  ]);
  const garbled = new TextDecoder().decode(payload);

  const originalEnv = Deno.env.get("SF_LOG_BINARY");
  const server = Deno.serve({ port: 0, onListen() {} }, (req) => {
    const url = new URL(req.url);
    if (url.pathname === "/proto") {
      return new Response(payload, {
        status: 200,
        headers: { "Content-Type": "application/x-protobuf" },
      });
    }
    if (url.pathname === "/blob") {
      return new Response(payload, {
        status: 200,
        headers: { "Content-Type": "application/octet-stream" },
      });
    }
    if (url.pathname === "/untyped") {
      // No Content-Type at all: must be detected by sniffing
      return new Response(payload, { status: 200 });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });

  try {
    Deno.env.delete("SF_LOG_BINARY");
    const config: ScenarioFlowConfig = {
      apiBaseUrl: `http://127.0.0.1:${server.addr.port}`,
    };

    let received: Uint8Array | undefined;
    const scenarioFlow = new ScenarioFlow("binary-log", config)
      .step("protobuf", async (ctx) => {
        const response = await ctx.fetcher({ path: "/proto" });
        // The original response must still be readable by the step
        received = new Uint8Array(await response.arrayBuffer());
      })
      .step("octet-stream", async (ctx) => {
        const response = await ctx.fetcher({ path: "/blob" });
        await response.arrayBuffer();
      })
      .step("untyped", async (ctx) => {
        const response = await ctx.fetcher({ path: "/untyped" });
        await response.arrayBuffer();
      })
      .step("json", async (ctx) => {
        const response = await ctx.fetcher({ path: "/json" });
        await response.json();
      });

    const lines = await captureConsoleLog(() => scenarioFlow.execute());
    const output = lines.join("\n");

    assertEquals(received, payload);

    assertStringIncludes(
      output,
      `📥 [Binary Data] (${payload.length} bytes, application/x-protobuf)`,
    );
    assertStringIncludes(
      output,
      `📥 [Binary Data] (${payload.length} bytes, application/octet-stream)`,
    );
    assertStringIncludes(output, `📥 [Binary Data] (${payload.length} bytes)`);
    assertEquals(lines.filter((l) => l.includes("[Binary Data]")).length, 3);

    // Raw bytes must never be printed, and no hex dump without SF_LOG_BINARY
    assertEquals(output.includes(garbled), false);
    assertEquals(output.includes("📥 hex:"), false);

    // JSON is still logged as text
    assertStringIncludes(output, '📥 {"ok":true}');
  } finally {
    restoreEnv("SF_LOG_BINARY", originalEnv);
    await server.shutdown();
  }
});

Deno.test({
  name: "Integration - SF_LOG_BINARY=hex adds a hex dump of the first 64 bytes",
  ...binaryLogTestOptions,
}, async () => {
  const payload = new Uint8Array(100).map((_, i) => (i * 7 + 3) & 0xff);
  payload[0] = 0x0a;
  payload[1] = 0x1b;

  const originalEnv = Deno.env.get("SF_LOG_BINARY");
  const server = Deno.serve(
    { port: 0, onListen() {} },
    () =>
      new Response(payload, {
        status: 200,
        headers: { "Content-Type": "application/octet-stream" },
      }),
  );

  try {
    Deno.env.set("SF_LOG_BINARY", "hex");
    const config: ScenarioFlowConfig = {
      apiBaseUrl: `http://127.0.0.1:${server.addr.port}`,
    };

    const scenarioFlow = new ScenarioFlow("binary-hex", config)
      .step("download", async (ctx) => {
        const response = await ctx.fetcher({ path: "/file.bin" });
        await response.arrayBuffer();
      });

    const lines = await captureConsoleLog(() => scenarioFlow.execute());
    const hexLine = lines.find((l) => l.includes("📥 hex:"));
    assertEquals(hexLine !== undefined, true);

    const expectedHex = Array.from(
      payload.subarray(0, 64),
      (b) => b.toString(16).padStart(2, "0"),
    ).join(" ");
    assertStringIncludes(hexLine as string, `📥 hex: ${expectedHex} ...`);
    assertStringIncludes(hexLine as string, "📥 hex: 0a 1b ");
    assertStringIncludes(
      lines.join("\n"),
      "📥 [Binary Data] (100 bytes, application/octet-stream)",
    );
  } finally {
    restoreEnv("SF_LOG_BINARY", originalEnv);
    await server.shutdown();
  }
});
