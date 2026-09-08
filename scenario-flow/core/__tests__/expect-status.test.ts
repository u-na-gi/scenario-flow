import { assertEquals, assertRejects } from "@std/assert";
import { ScenarioFlow } from "../index.ts";
import { logger } from "../logger.ts";

/**
 * Start a local HTTP server on a random port that answers with the status
 * encoded in the path (`/status/401` -> 401) and echoes the request method.
 */
function startStatusServer(): {
  server: Deno.HttpServer;
  baseUrl: string;
  requests: Array<{ method: string; path: string }>;
} {
  const requests: Array<{ method: string; path: string }> = [];
  const server = Deno.serve(
    { port: 0, hostname: "127.0.0.1", onListen: () => {} },
    (req) => {
      const url = new URL(req.url);
      requests.push({ method: req.method, path: url.pathname });
      const status = Number(url.pathname.split("/").pop());
      return new Response(JSON.stringify({ status }), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    },
  );
  const { hostname, port } = server.addr as Deno.NetAddr;
  return { server, baseUrl: `http://${hostname}:${port}`, requests };
}

/**
 * Capture console.log output while `fn` runs.
 * Pass `lines` to keep the captured output even when `fn` throws.
 */
async function captureLog(
  fn: () => Promise<void>,
  lines: string[] = [],
): Promise<string[]> {
  const originalLog = console.log;
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

Deno.test("expectStatus - matching 401 returns the Response", async () => {
  const { server, baseUrl } = startStatusServer();
  try {
    const flow = new ScenarioFlow("expectStatus match", {
      apiBaseUrl: baseUrl,
    });
    let seen: { status: number; body: { status: number } } | undefined;

    flow.step("GET /status/401 expecting 401", async (ctx) => {
      const response = await ctx.fetcher({
        path: "/status/401",
        method: "GET",
        expectStatus: 401,
      });
      seen = { status: response.status, body: await response.json() };
    });

    const lines = await captureLog(() => flow.execute());

    assertEquals(seen?.status, 401);
    assertEquals(seen?.body, { status: 401 });
    // Status line is marked as a success with the expectation shown
    const statusLine = lines.find((l) => l.includes("401 Unauthorized"));
    assertEquals(statusLine !== undefined, true);
    assertEquals(statusLine?.includes("✅"), true);
    assertEquals(statusLine?.includes("expected 401 / actual 401"), true);
  } finally {
    await server.shutdown();
  }
});

Deno.test("expectStatus - list of statuses matches any of them", async () => {
  const { server, baseUrl } = startStatusServer();
  try {
    const flow = new ScenarioFlow("expectStatus list", { apiBaseUrl: baseUrl });
    const statuses: number[] = [];

    flow
      .step("400", async (ctx) => {
        const res = await ctx.fetcher({
          path: "/status/400",
          expectStatus: [400, 422],
        });
        statuses.push(res.status);
      })
      .step("422", async (ctx) => {
        const res = await ctx.fetcher({
          path: "/status/422",
          expectStatus: [400, 422],
        });
        statuses.push(res.status);
      });

    await captureLog(() => flow.execute());
    assertEquals(statuses, [400, 422]);
  } finally {
    await server.shutdown();
  }
});

Deno.test("expectStatus - mismatch throws with a clear message", async () => {
  const { server, baseUrl } = startStatusServer();
  try {
    const flow = new ScenarioFlow("expectStatus mismatch", {
      apiBaseUrl: baseUrl,
    });

    flow.step("GET /status/200 expecting 401", async (ctx) => {
      await ctx.fetcher({ path: "/status/200", expectStatus: 401 });
    });

    const lines: string[] = [];
    await assertRejects(
      () => captureLog(() => flow.execute(), lines),
      Error,
      `Expected status 401 but got 200 (GET ${baseUrl}/status/200)`,
    );
    // Even a 2xx is flagged as a failure when it was not the expected status
    const statusLine = lines.find((l) => l.includes("200 OK"));
    assertEquals(statusLine?.includes("❌"), true);
    assertEquals(statusLine?.includes("expected 401 / actual 200"), true);
  } finally {
    await server.shutdown();
  }
});

Deno.test("throwOnError=false - returns the Response for 500", async () => {
  const { server, baseUrl } = startStatusServer();
  try {
    const flow = new ScenarioFlow("throwOnError false", {
      apiBaseUrl: baseUrl,
    });
    let status: number | undefined;

    flow.step("GET /status/500", async (ctx) => {
      const response = await ctx.fetcher({
        path: "/status/500",
        throwOnError: false,
      });
      status = response.status;
    });

    await captureLog(() => flow.execute());
    assertEquals(status, 500);
  } finally {
    await server.shutdown();
  }
});

Deno.test("throwOnError=false - expectStatus mismatch does not throw", async () => {
  const { server, baseUrl } = startStatusServer();
  try {
    const flow = new ScenarioFlow("throwOnError false + expectStatus", {
      apiBaseUrl: baseUrl,
    });
    let status: number | undefined;

    flow.step("GET /status/200 expecting 401, no throw", async (ctx) => {
      const response = await ctx.fetcher({
        path: "/status/200",
        expectStatus: 401,
        throwOnError: false,
      });
      status = response.status;
    });

    await captureLog(() => flow.execute());
    assertEquals(status, 200);
  } finally {
    await server.shutdown();
  }
});

Deno.test("default - non-2xx still throws HTTP error", async () => {
  const { server, baseUrl } = startStatusServer();
  try {
    const flow = new ScenarioFlow("default throws", { apiBaseUrl: baseUrl });

    flow.step("GET /status/404", async (ctx) => {
      await ctx.fetcher({ path: "/status/404" });
    });

    await assertRejects(
      () => captureLog(() => flow.execute()),
      Error,
      "HTTP error! status: 404",
    );
  } finally {
    await server.shutdown();
  }
});

Deno.test("fetcher - scenario-flow options are not forwarded to fetch()", async () => {
  const originalFetch = globalThis.fetch;
  let capturedInit: RequestInit | undefined;
  globalThis.fetch = async (
    _url: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    await Promise.resolve();
    capturedInit = init;
    return new Response("ok", { status: 401 });
  };

  try {
    const flow = new ScenarioFlow("init forwarding", {
      apiBaseUrl: "https://api.example.com",
    });
    flow.step("call", async (ctx) => {
      await ctx.fetcher({
        path: "/x",
        method: "POST",
        headers: { "X-Test": "1" },
        expectStatus: 401,
        throwOnError: true,
      });
    });
    await captureLog(() => flow.execute());

    assertEquals(capturedInit?.method, "POST");
    assertEquals(
      (capturedInit?.headers as Record<string, string>)["X-Test"],
      "1",
    );
    assertEquals("path" in (capturedInit ?? {}), false);
    assertEquals("expectStatus" in (capturedInit ?? {}), false);
    assertEquals("throwOnError" in (capturedInit ?? {}), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("logger.logResponse - expected parameter drives the icon", async () => {
  const lines = await captureLog(async () => {
    await Promise.resolve();
    logger.logResponse(401, "Unauthorized", 1, undefined, 401);
    logger.logResponse(200, "OK", 1, undefined, 401);
    logger.logResponse(401, "Unauthorized", 1);
    logger.logResponse(200, "OK", 1);
  });

  assertEquals(lines[0].includes("✅ 401 Unauthorized"), true);
  assertEquals(lines[0].includes("(expected 401 / actual 401)"), true);
  assertEquals(lines[1].includes("❌ 200 OK"), true);
  assertEquals(lines[1].includes("(expected 401 / actual 200)"), true);
  // Legacy behaviour without `expected` is unchanged
  assertEquals(lines[2].includes("❌ 401 Unauthorized"), true);
  assertEquals(lines[2].includes("expected"), false);
  assertEquals(lines[3].includes("✅ 200 OK"), true);
});
