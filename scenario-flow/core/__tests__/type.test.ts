import { assertEquals, assertThrows } from "@std/assert";
import type {
  ResolvedScenarioFlowConfig,
  ScenarioFlowConfig,
  ScenarioFlowRequest,
  ScenarioFlowStepFunction,
} from "../type.ts";
import { createCtx, type ScenarioFlowContext } from "../context.ts";
import { ScenarioFlow, type ScenarioFlowChain } from "../index.ts";

Deno.test("ScenarioFlowConfig - interface structure", () => {
  const config: ScenarioFlowConfig = {
    apiBaseUrl: "https://api.example.com",
  };

  assertEquals(typeof config.apiBaseUrl, "string");
  assertEquals(config.apiBaseUrl, "https://api.example.com");
});

Deno.test("ScenarioFlowConfig - various URL formats", () => {
  const configs: ScenarioFlowConfig[] = [
    { apiBaseUrl: "https://api.example.com" },
    { apiBaseUrl: "http://localhost:3000" },
    { apiBaseUrl: "https://api.example.com/" },
    { apiBaseUrl: "https://subdomain.api.example.com/v1" },
  ];

  configs.forEach((config) => {
    assertEquals(typeof config.apiBaseUrl, "string");
    if (typeof config.apiBaseUrl === "string") {
      assertEquals(config.apiBaseUrl.length > 0, true);
    }
  });
});

Deno.test("ScenarioFlowRequest - basic structure", () => {
  const request: ScenarioFlowRequest = {
    path: "/users/123",
    method: "GET",
  };

  assertEquals(typeof request.path, "string");
  assertEquals(request.path, "/users/123");

  assertEquals(request.method, "GET");
});

Deno.test("ScenarioFlowRequest - extends RequestInit", () => {
  const request: ScenarioFlowRequest = {
    path: "/api/data",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer token123",
    },
    body: JSON.stringify({ name: "test", value: 123 }),
  };

  assertEquals(typeof request.path, "string");
  assertEquals(request.method, "POST");
  assertEquals(typeof request.headers, "object");
  assertEquals(typeof request.body, "string");
});

Deno.test("ScenarioFlowRequest - various HTTP methods", () => {
  const methods = ["GET", "POST", "PUT", "DELETE", "PATCH"];

  methods.forEach((method) => {
    const request: ScenarioFlowRequest = {
      path: "/test",
      method: method as unknown as "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
    };

    assertEquals(request.method, method);
    assertEquals(typeof request.path, "string");
  });
});

Deno.test("ScenarioFlowRequest - empty path", () => {
  const request: ScenarioFlowRequest = {
    path: "",
    method: "GET",
  };

  assertEquals(typeof request.path, "string");
  assertEquals(request.path.length, 0);
});

Deno.test("ScenarioFlowRequest - complex path", () => {
  const request: ScenarioFlowRequest = {
    path: "/api/v1/users/123/profile/settings",
    method: "GET",
  };

  assertEquals(typeof request.path, "string");
  assertEquals(request.path, "/api/v1/users/123/profile/settings");
});

Deno.test("ScenarioFlowRequest - with query parameters in RequestInit", () => {
  const request: ScenarioFlowRequest = {
    path: "/search",
    method: "GET",
    // Note: query parameters would typically be handled in the URL construction
    // but we can test that RequestInit properties are preserved
    cache: "no-cache",
    credentials: "include",
  };

  assertEquals(request.path, "/search");
  assertEquals(request.cache, "no-cache");
  assertEquals(request.credentials, "include");
});

Deno.test("ScenarioFlowRequest - with request body", () => {
  const requestData = {
    username: "testuser",
    email: "test@example.com",
    preferences: {
      theme: "dark",
      notifications: true,
    },
  };

  const request: ScenarioFlowRequest = {
    path: "/users",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestData),
  };

  assertEquals(request.method, "POST");
  assertEquals(typeof request.body, "string");

  const parsedBody = JSON.parse(request.body as string);
  assertEquals(parsedBody.username, "testuser");
  assertEquals(parsedBody.preferences.theme, "dark");
});

Deno.test("ScenarioFlowRequest - path with special characters", () => {
  const request: ScenarioFlowRequest = {
    path: "/users/user@example.com/data-2024/file_name.json",
    method: "GET",
  };

  assertEquals(typeof request.path, "string");
  assertEquals(
    request.path,
    "/users/user@example.com/data-2024/file_name.json",
  );
});

Deno.test("ScenarioFlowRequest - minimal required properties", () => {
  const request: ScenarioFlowRequest = {
    path: "/minimal",
  };

  assertEquals(typeof request.path, "string");
  assertEquals(request.path, "/minimal");
  // method is optional since it extends RequestInit where method has a default
});

// ---------------------------------------------------------------------------
// Typed context (issue #20)
// These tests are mostly compile-time: `deno test` type-checks this file, so a
// wrong `Equal<>` assertion or an unused `@ts-expect-error` fails the suite.
// ---------------------------------------------------------------------------

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;
const assertType = <_T extends true>(): void => {};

const config: ResolvedScenarioFlowConfig = {
  apiBaseUrl: "https://api.example.com",
};
const noop = async (): Promise<void> => {};

interface LoginCtx {
  token: string;
  userId: number;
}
type DataCtx = { items: string[] };

Deno.test("Typed context - untyped ScenarioFlow keeps today's behaviour", () => {
  const flow = new ScenarioFlow("untyped", config);
  assertType<Equal<typeof flow, ScenarioFlow<Record<string, unknown>>>>();

  flow.step("any key / any value", async (ctx) => {
    await noop();
    ctx.setContext("anything", 42);
    ctx.setContext("other", { nested: true });

    const raw = ctx.getContext("anything");
    assertType<Equal<typeof raw, unknown>>();

    const typed = ctx.getContext<string>("anything");
    assertType<Equal<typeof typed, string | undefined>>();
  });
});

Deno.test("Typed context - keys and values are checked when Ctx is declared", () => {
  const login = new ScenarioFlow<LoginCtx>("login", config)
    .step("login", async (ctx) => {
      await noop();
      ctx.setContext("token", "jwt");
      ctx.setContext("userId", 1);

      // @ts-expect-error value type mismatch: token must be a string
      ctx.setContext("token", 123);
      // @ts-expect-error unknown key
      ctx.setContext("nope", "x");
      // @ts-expect-error unknown key
      ctx.getContext("nope");

      const token = ctx.getContext("token");
      assertType<Equal<typeof token, string | undefined>>();
      const userId = ctx.getContext("userId");
      assertType<Equal<typeof userId, number | undefined>>();

      // Explicit type argument still works on a known key
      const explicit = ctx.getContext<string>("token");
      assertType<Equal<typeof explicit, string | undefined>>();
    });

  assertType<Equal<typeof login, ScenarioFlowChain<LoginCtx>>>();
});

Deno.test("Typed context - constructor inherits the parent's Ctx", () => {
  const login = new ScenarioFlow<LoginCtx>("login", config);
  const child = new ScenarioFlow("child", login);
  assertType<Equal<typeof child, ScenarioFlow<LoginCtx>>>();

  child.step("read parent value", async (ctx) => {
    await noop();
    const token = ctx.getContext("token");
    assertType<Equal<typeof token, string | undefined>>();
  });

  // Own keys can be added by spelling the intersection explicitly ...
  const explicit = new ScenarioFlow<LoginCtx & DataCtx>("explicit", login);
  assertType<Equal<typeof explicit, ScenarioFlow<LoginCtx & DataCtx>>>();
  explicit.step("both", async (ctx) => {
    await noop();
    ctx.setContext("items", ["a"]);
    const token = ctx.getContext("token");
    assertType<Equal<typeof token, string | undefined>>();
  });

  // ... but the declared Ctx must extend the parent's Ctx.
  // @ts-expect-error conflicting value type for "token" (string in parent)
  new ScenarioFlow<{ token: number }>("conflict", login);
  // @ts-expect-error unrelated Ctx: parent's keys are missing
  new ScenarioFlow<DataCtx>("unrelated", login);
  // @ts-expect-error narrower than the parent's Ctx
  new ScenarioFlow<LoginCtx>("narrower", explicit);
  // (a bare `{ execute }` object is covered by the run-time test below)

  // An untyped parent accepts any declared Ctx (interface or type alias)
  const untyped = new ScenarioFlow("untyped", config);
  const fromUntyped = new ScenarioFlow<LoginCtx>("typed child", untyped);
  assertType<Equal<typeof fromUntyped, ScenarioFlow<LoginCtx>>>();
});

Deno.test("Typed context - a bare object is rejected at run time too", () => {
  assertThrows(
    () => {
      // @ts-expect-error a bare object is not a scenario chain
      new ScenarioFlow<LoginCtx>("bare", { execute: noop });
    },
    Error,
    "Invalid argument: ScenarioFlow constructor expects ScenarioFlowConfig or ScenarioFlowChain",
  );
});

Deno.test("Typed context - an untyped step function is accepted on a typed chain", () => {
  // Gradual migration: existing untyped step functions keep compiling, but
  // they do not get key checking.
  const legacyStep: ScenarioFlowStepFunction = async (ctx) => {
    await noop();
    ctx.setContext("anything", 1);
  };
  const chain = new ScenarioFlow<LoginCtx>("typed", config).step(
    "legacy",
    legacyStep,
  );
  assertType<Equal<typeof chain, ScenarioFlowChain<LoginCtx>>>();
});

Deno.test("Typed context - extend() yields Parent & Own", () => {
  const login = new ScenarioFlow<LoginCtx>("login", config);
  const getData = login.extend<DataCtx>("get data");
  assertType<Equal<typeof getData, ScenarioFlow<LoginCtx & DataCtx>>>();

  getData.step("use both", async (ctx) => {
    await noop();
    const token = ctx.getContext("token");
    assertType<Equal<typeof token, string | undefined>>();
    ctx.setContext("items", ["x"]);
    // @ts-expect-error items must be string[]
    ctx.setContext("items", "x");
  });

  // extend() without a type argument just inherits the parent's Ctx
  const plain = login.extend("plain");
  assertType<Equal<typeof plain, ScenarioFlow<LoginCtx>>>();
});

Deno.test("Typed context - step(parent) widens the chain's Ctx", () => {
  const login = new ScenarioFlow<LoginCtx>("login", config);
  const chain = new ScenarioFlow<DataCtx>("main", config)
    .step(login)
    .step("after", async (ctx) => {
      await noop();
      const token = ctx.getContext("token");
      assertType<Equal<typeof token, string | undefined>>();
      ctx.setContext("items", []);
    });
  assertType<Equal<typeof chain, ScenarioFlowChain<DataCtx & LoginCtx>>>();
});

Deno.test("Typed context - untyped parent or child does not erase the typed side", () => {
  const untyped = new ScenarioFlow("untyped", config);
  const typedChild = untyped.extend<DataCtx>("typed child");
  assertType<Equal<typeof typedChild, ScenarioFlow<DataCtx>>>();

  const typedParent = new ScenarioFlow<LoginCtx>("typed", config);
  const untypedChild = typedParent.extend("untyped child");
  assertType<Equal<typeof untypedChild, ScenarioFlow<LoginCtx>>>();

  const widened = new ScenarioFlow<LoginCtx>("main", config).step(untyped);
  assertType<Equal<typeof widened, ScenarioFlowChain<LoginCtx>>>();
});

Deno.test("Typed context - ScenarioFlowContext<Ctx> runtime behaviour", () => {
  const ctx: ScenarioFlowContext<LoginCtx> = createCtx<LoginCtx>(
    async () => {
      await noop();
      return new Response("ok");
    },
    config,
  );
  ctx.setContext("token", "jwt");
  assertEquals(ctx.getContext("token"), "jwt");
  assertEquals(ctx.getContext("userId"), undefined);
  assertEquals(ctx.customContext, { token: "jwt" });
});
