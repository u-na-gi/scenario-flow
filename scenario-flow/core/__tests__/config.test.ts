import { assertEquals, assertThrows } from "@std/assert";
import { ScenarioFlow } from "../index.ts";
import { createCtx } from "../context.ts";
import {
  DEFAULT_API_BASE_URL_ENV_KEY,
  readEnvVar,
  resolveApiBaseUrl,
  resolveConfig,
} from "../config.ts";
import type {
  ResolvedScenarioFlowConfig,
  ScenarioFlowConfig,
} from "../type.ts";

const ENV = DEFAULT_API_BASE_URL_ENV_KEY;

/** Run `fn` with the given env vars set, restoring the previous state after. */
async function withEnv(
  vars: Record<string, string | undefined>,
  fn: () => void | Promise<void>,
): Promise<void> {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    previous[key] = Deno.env.get(key);
    const value = vars[key];
    if (value === undefined) Deno.env.delete(key);
    else Deno.env.set(key, value);
  }
  try {
    await fn();
  } finally {
    for (const key of Object.keys(previous)) {
      const value = previous[key];
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
}

/** Execute `flow` with one extra step and return the config it observed. */
async function configOf(
  flow: ScenarioFlow,
): Promise<ResolvedScenarioFlowConfig> {
  let resolved: ResolvedScenarioFlowConfig | undefined;
  flow.step("capture", (ctx) => {
    resolved = ctx.getConfig();
    return Promise.resolve();
  });
  await flow.execute();
  return resolved!;
}

Deno.test("resolveConfig - string config is unchanged without env", async () => {
  await withEnv({ [ENV]: undefined }, () => {
    const config: ScenarioFlowConfig = {
      apiBaseUrl: "https://api.example.com",
    };
    const resolved = resolveConfig(config);
    assertEquals(resolved, { apiBaseUrl: "https://api.example.com" });
    // returns a copy, does not mutate the input
    assertEquals(config.apiBaseUrl, "https://api.example.com");
  });
});

Deno.test("resolveConfig - function config is called once at resolution", async () => {
  await withEnv({ [ENV]: undefined }, () => {
    let calls = 0;
    const resolved = resolveConfig({
      apiBaseUrl: () => {
        calls++;
        return "https://fn.example.com";
      },
    });
    assertEquals(resolved.apiBaseUrl, "https://fn.example.com");
    assertEquals(calls, 1);
  });
});

Deno.test("resolveConfig - object config uses default without env", async () => {
  await withEnv({ [ENV]: undefined, MY_API_URL: undefined }, () => {
    assertEquals(
      resolveConfig({ apiBaseUrl: { default: "https://default.example.com" } })
        .apiBaseUrl,
      "https://default.example.com",
    );
    assertEquals(
      resolveConfig({
        apiBaseUrl: {
          default: "https://default.example.com",
          envKey: "MY_API_URL",
        },
      }).apiBaseUrl,
      "https://default.example.com",
    );
  });
});

Deno.test("resolveConfig - object config with custom envKey is overridden by that env", async () => {
  await withEnv(
    {
      [ENV]: "https://sf.example.com",
      MY_API_URL: "https://custom.example.com",
    },
    () => {
      const resolved = resolveConfig({
        apiBaseUrl: {
          default: "https://default.example.com",
          envKey: "MY_API_URL",
        },
      });
      // custom envKey wins; SF_API_BASE_URL is not consulted for this config
      assertEquals(resolved.apiBaseUrl, "https://custom.example.com");
    },
  );
});

Deno.test("resolveConfig - SF_API_BASE_URL takes precedence over every config form", async () => {
  await withEnv({ [ENV]: "https://env.example.com" }, () => {
    let fnCalls = 0;
    assertEquals(
      resolveConfig({ apiBaseUrl: "https://string.example.com" }).apiBaseUrl,
      "https://env.example.com",
    );
    assertEquals(
      resolveConfig({
        apiBaseUrl: () => {
          fnCalls++;
          return "https://fn.example.com";
        },
      }).apiBaseUrl,
      "https://env.example.com",
    );
    assertEquals(fnCalls, 0, "function is not called when env overrides");
    assertEquals(
      resolveConfig({ apiBaseUrl: { default: "https://default.example.com" } })
        .apiBaseUrl,
      "https://env.example.com",
    );
  });
});

Deno.test("resolveConfig - empty env value is treated as unset", async () => {
  await withEnv({ [ENV]: "" }, () => {
    assertEquals(
      resolveConfig({ apiBaseUrl: "https://string.example.com" }).apiBaseUrl,
      "https://string.example.com",
    );
  });
});

Deno.test("resolveApiBaseUrl - invalid option throws", () => {
  assertThrows(
    // @ts-ignore - testing invalid runtime input
    () => resolveApiBaseUrl(42),
    TypeError,
    "Invalid apiBaseUrl",
  );
  assertThrows(
    // @ts-ignore - testing invalid runtime input
    () => resolveApiBaseUrl({ envKey: "X" }),
    TypeError,
    "Invalid apiBaseUrl",
  );
});

Deno.test("readEnvVar - does not throw when Deno.env.get is not permitted", () => {
  const original = Deno.env.get;
  try {
    Deno.env.get = () => {
      throw new Deno.errors.NotCapable("Requires env access");
    };
    assertEquals(readEnvVar(ENV), undefined);
    assertEquals(
      resolveConfig({ apiBaseUrl: "https://string.example.com" }).apiBaseUrl,
      "https://string.example.com",
    );
  } finally {
    Deno.env.get = original;
  }
});

Deno.test("resolveApiBaseUrl - env override is logged once per process", async () => {
  const key = "SF_TEST_LOG_ONCE_KEY";
  await withEnv({ [key]: "https://logged.example.com" }, () => {
    const originalLog = console.log;
    const lines: string[] = [];
    console.log = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };
    try {
      resolveApiBaseUrl({ default: "https://a", envKey: key });
      resolveApiBaseUrl({ default: "https://b", envKey: key });
      resolveApiBaseUrl({ default: "https://c", envKey: key });
    } finally {
      console.log = originalLog;
    }
    const matches = lines.filter((l) =>
      l.includes(`apiBaseUrl overridden by ${key}: https://logged.example.com`)
    );
    assertEquals(matches.length, 1);
  });
});

Deno.test("ScenarioFlow - constructor resolves apiBaseUrl and getConfig returns a string", async () => {
  await withEnv({ [ENV]: undefined }, async () => {
    const flow = new ScenarioFlow("fn", {
      apiBaseUrl: () => "https://fn.example.com",
    });
    const config = await configOf(flow);
    const url: string = config.apiBaseUrl; // type-level: resolved to string
    assertEquals(url, "https://fn.example.com");
  });

  await withEnv({ [ENV]: "https://env.example.com" }, async () => {
    const flow = new ScenarioFlow("env", { apiBaseUrl: "http://a" });
    assertEquals((await configOf(flow)).apiBaseUrl, "https://env.example.com");
  });
});

Deno.test("ScenarioFlow - inherited config is already resolved (no double resolution)", async () => {
  await withEnv({ [ENV]: undefined }, async () => {
    let calls = 0;
    const parent = new ScenarioFlow("parent", {
      apiBaseUrl: () => {
        calls++;
        return "https://parent.example.com";
      },
    });
    const child = new ScenarioFlow("child", parent);
    assertEquals(calls, 1);

    let seen: string | undefined;
    child.step("check", (ctx) => {
      seen = ctx.getConfig().apiBaseUrl;
      return Promise.resolve();
    });
    await child.execute();
    assertEquals(seen, "https://parent.example.com");
    assertEquals(calls, 1);
  });
});

Deno.test("createCtx - accepts config forms and getConfig returns resolved string", async () => {
  await withEnv({ [ENV]: undefined }, () => {
    const fetcher = () => Promise.resolve(new Response("ok"));
    const ctx = createCtx(fetcher, {
      apiBaseUrl: () => "https://ctx.example.com",
    });
    assertEquals(ctx.getConfig().apiBaseUrl, "https://ctx.example.com");
    // already resolved configs pass through unchanged
    const ctx2 = createCtx(fetcher, {
      apiBaseUrl: "https://plain.example.com",
    });
    assertEquals(ctx2.getConfig(), { apiBaseUrl: "https://plain.example.com" });
  });
});

Deno.test("Integration - request goes to SF_API_BASE_URL instead of configured apiBaseUrl", async () => {
  const requests: string[] = [];
  const server = Deno.serve(
    { port: 0, hostname: "127.0.0.1", onListen: () => {} },
    (req) => {
      requests.push(new URL(req.url).pathname);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    },
  );
  const envUrl = `http://127.0.0.1:${server.addr.port}`;

  try {
    await withEnv({ [ENV]: envUrl }, async () => {
      const flow = new ScenarioFlow("env-override", { apiBaseUrl: "http://a" });
      let body: { ok?: boolean } = {};
      flow.step("ping", async (ctx) => {
        assertEquals(ctx.getConfig().apiBaseUrl, envUrl);
        const res = await ctx.fetcher({ path: "/ping", method: "GET" });
        body = await res.json();
      });
      await flow.execute();
      assertEquals(body, { ok: true });
      assertEquals(requests, ["/ping"]);
    });
  } finally {
    await server.shutdown();
  }
});
