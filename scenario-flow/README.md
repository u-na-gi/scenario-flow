# scenario-flow

A TypeScript library for scenario-based testing and automation that provides a
fluent API for building and executing API test scenarios.

## Features

- 🔗 **Fluent API**: Chain multiple steps together for readable test scenarios
- 📝 **Built-in Logging**: Automatic request/response logging with timing
- 🔧 **Context Management**: Share data between steps with built-in context
- 🚀 **TypeScript Support**: Full type safety with TypeScript, including typed
  scenario context
- 🌐 **HTTP Client**: Built-in fetch-based HTTP client with error handling

## Installation

```bash
# Using Deno
import { ScenarioFlow } from "jsr:@u-na-gi/scenario-flow";

# Using npm
npx jsr add @u-na-gi/scenario-flow
```

## Quick Start

```typescript
import { ScenarioFlow } from "@u-na-gi/scenario-flow";

const config = {
  apiBaseUrl: "https://api.example.com",
};

const scenario = new ScenarioFlow("User Login Flow", config);

await scenario
  .step("Login user", async (ctx) => {
    const response = await ctx.fetcher({
      path: "/auth/login",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "user@example.com",
        password: "password123",
      }),
    });

    const data = await response.json();
    ctx.setContext("authToken", data.token);
  })
  .step("Get user profile", async (ctx) => {
    const token = ctx.getContext<string>("authToken"); // string | undefined

    const response = await ctx.fetcher({
      path: "/user/profile",
      headers: {
        "Authorization": `Bearer ${token}`,
      },
    });

    const profile = await response.json();
    console.log("User profile:", profile);
  })
  .execute();
```

## Typed Context

Declare the shape of the context once per scenario and `setContext` /
`getContext` become fully typed: keys are checked and `getContext` returns the
declared value type (no `as` casts needed).

```typescript
type LoginCtx = {
  token: string;
  userId: number;
};

export const login = new ScenarioFlow<LoginCtx>("Login", config)
  .step("Authenticate", async (ctx) => {
    const res = await ctx.fetcher({ path: "/auth/login", method: "POST" });
    const data = await res.json();

    ctx.setContext("token", data.token); // value must be a string
    ctx.setContext("userId", data.id);
    // ctx.setContext("token", 123);     // compile error: wrong value type
    // ctx.getContext("typo");           // compile error: unknown key
  });
```

### Inheriting a parent scenario

| Form                                                | Resulting context type            |
| --------------------------------------------------- | --------------------------------- |
| `new ScenarioFlow("child", login)`                  | `LoginCtx` (inferred from parent) |
| `login.extend<Own>("child")`                        | `LoginCtx & Own`                  |
| `new ScenarioFlow<LoginCtx & Own>("child", login)`  | `LoginCtx & Own` (as declared)    |
| `new ScenarioFlow<Own>("main", config).step(login)` | chain typed as `Own & LoginCtx`   |

```typescript
type GetDataCtx = { items: string[] };

// Parent's steps run first; the child sees the parent's keys and its own.
const getData = login.extend<GetDataCtx>("Get data")
  .step("Fetch", async (ctx) => {
    const token = ctx.getContext("token"); // string | undefined
    const res = await ctx.fetcher({
      path: "/api/data",
      headers: { Authorization: `Bearer ${token}` },
    });
    ctx.setContext("items", await res.json());
  });

await getData.execute();
```

When the context type is declared explicitly
(`new ScenarioFlow<Ctx>("child", parent)`), `Ctx` must extend the parent's
context type: `ParentCtx & Own` and `ParentCtx` are accepted, a conflicting,
unrelated or narrower `Ctx` is a compile error, and an untyped parent accepts
any `Ctx`.

**Inheriting copies the context; it is never shared.** A child scenario gets its
own context object and its own copy of the config. The copy is a **shallow
snapshot taken at construction**: top-level values the parent holds at that
moment are copied, but nested objects are not cloned, so a nested object stored
by the parent is shared between the parent and all of its children (values are
not deep-cloned because they may not be cloneable). The parent's steps run again
inside each child's `execute()` against that child's context, so two children of
the same parent (e.g. many scenarios built on `login`) never see each other's
top-level values, and children never write into the parent's context.

An untyped scenario (no type argument) behaves like `Record<string, unknown>`:
any key is allowed, `getContext(key)` returns `unknown` and `getContext<T>(key)`
returns `T | undefined`. Combining a typed and an untyped scenario keeps the
typed side (`InheritedContext<Parent, Own>`). For gradual migration, an untyped
`ScenarioFlowStepFunction` is still accepted by `.step()` on a typed chain; such
a step does not get key checking.

## API Reference

### ScenarioFlow

The main class for creating and executing test scenarios.

#### Constructor

```typescript
new ScenarioFlow<Ctx = Record<string, unknown>>(name: string, config: ScenarioFlowConfig)
new ScenarioFlow(name: string, parent: ScenarioFlowChain<Ctx>)   // Ctx inferred from parent
new ScenarioFlow<Ctx>(name: string, parent: ScenarioFlowChain)   // Ctx as declared
```

- `name`: A descriptive name for the scenario
- `config`: Configuration object containing `apiBaseUrl` (a string, a
  `() => string`, or `{ default, envKey? }` — see
  [Overriding the base URL](#overriding-the-base-url))
- `parent`: Another scenario whose steps and context are inherited

#### Methods

##### `.step(name: string, fn: ScenarioFlowStepFunction<Ctx>): ScenarioFlowChain<Ctx>`

Add a step to the scenario.

- `name`: Step name for logging
- `fn`: Async function that receives the context

##### `.step(parent: ScenarioFlowChain<Parent>): ScenarioFlowChain<Ctx & Parent>`

Append another scenario's steps to this one.

##### `.extend<Own>(name: string): ScenarioFlow<Ctx & Own>`

Create a new scenario that inherits this scenario's steps and context and adds
its own context keys.

##### `.execute(): Promise<void>`

Execute all steps in the scenario.

### Context Methods

The context object (`ScenarioFlowContext<Ctx>`) passed to each step provides:

- `fetcher(request)`: Make HTTP requests
- `setContext(key, value)`: Store data for later steps (typed by `Ctx`)
- `getContext(key)`: Retrieve stored data as `Ctx[key] | undefined`
- `getContext<T>(key)`: Retrieve stored data as `T | undefined`
- `getConfig()`: Get the scenario configuration (`apiBaseUrl` is always a
  resolved `string` here)
- `addContext(key, value)`: Deprecated alias of `setContext`
- `assert`: Assertion helpers (see [Assertions](#assertions))

### Assertions

`ctx.assert` provides thin wrappers over `@std/assert`. On failure the step log
shows the expected and actual values (plus the call site), and the step throws a
`ScenarioAssertionError` carrying `expected`, `actual` and `message`.

```typescript
await scenario
  .step("save tag filter", async (ctx) => {
    const res = await ctx.fetcher({ path: "/tag-filter", method: "PUT" });
    ctx.assert.status(res, 200);

    const response = await res.json();
    ctx.assert.equal(response.success, true, "save tag filter");
    ctx.assert.deepEqual(response.tagIds, [createdTag.tagId]);
  })
  .execute();
```

Failure output inside the step block:

```
❌ ASSERTION FAILED: save tag filter (at ./scenario/tag-filter.sf.ts:42:7)
   expected: [ "abc" ]
   actual:   [ "abc", "def" ]
```

Available helpers: `equal` / `deepEqual`, `strictEqual`, `notEqual`, `ok`,
`exists`, `match`, `objectMatch`, `status(res, 200 | [200, 201])`, `fail`. The
same helpers are exported as `assert` from the package for use outside a step.
Raw `@std/assert` failures thrown inside a step are also reported as
`ASSERTION FAILED` (without expected/actual values).

Note: `ok` and `exists` use TypeScript assertion signatures, so call them
through a stable reference (`ctx.assert.ok(value)`); destructuring
(`const { assert } = ctx; assert.ok(value)`) defeats type narrowing (TS2775).

## Advanced Usage

### Chaining Scenarios

```typescript
const loginScenario = new ScenarioFlow("Login", config)
  .step("Authenticate", async (ctx) => {
    // Login logic
  });

const mainScenario = new ScenarioFlow("Main Flow", config)
  .step(loginScenario) // Chain another scenario
  .step("Additional step", async (ctx) => {
    // Additional logic
  });
```

### Overriding the base URL

The `apiBaseUrl` written in a scenario is a default. It can be overridden at run
time so the same scenarios can target a local server, staging, or production
without editing them:

```bash
# via environment variable
SF_API_BASE_URL=https://staging.example.com sfcli ./scenario-test

# via the CLI flag (sets SF_API_BASE_URL for the scenario processes)
sfcli --base-url https://staging.example.com ./scenario-test
```

`apiBaseUrl` accepts three forms:

```typescript
// 1. string — used as-is unless SF_API_BASE_URL is set
new ScenarioFlow("A", { apiBaseUrl: "http://localhost:3000" });

// 2. function — called once when the scenario is constructed
new ScenarioFlow("B", { apiBaseUrl: () => computeBaseUrl() });

// 3. object — `default` unless the env var named by `envKey` is set
new ScenarioFlow("C", {
  apiBaseUrl: { default: "http://localhost:3000", envKey: "MY_API_URL" },
});
```

Resolution rules:

- Resolution happens once, in the `ScenarioFlow` constructor. `ctx.getConfig()`
  always returns the resolved `string`.
- Precedence: the environment variable (`envKey`, default `SF_API_BASE_URL`)
  when it is set and non-empty, then the configured value (string / function
  result / `default`). The function is not called when the env override applies.
- An empty environment variable is treated as unset.
- Reading the environment requires `--allow-env` (at least
  `--allow-env=SF_API_BASE_URL`). Without it the override is silently ignored
  and the configured value is used; no permission prompt is triggered and no
  error is thrown.
- When an override is applied, `apiBaseUrl overridden by SF_API_BASE_URL: ...`
  is logged once per process (not once per scenario).
- Scenarios built from another scenario (`new ScenarioFlow(name, parent)`)
  inherit the parent's already resolved config.

### Error Handling

Scenarios automatically handle HTTP errors and provide detailed logging:

```typescript
await scenario
  .step("Test error handling", async (ctx) => {
    try {
      await ctx.fetcher({ path: "/invalid-endpoint" });
    } catch (error) {
      console.log("Caught expected error:", error.message);
    }
  })
  .execute();
```

### Verifying Error Responses

By default `ctx.fetcher` throws on any non-2xx status. To assert that an
endpoint returns a specific error status, pass `expectStatus`; the fetcher then
throws only when the actual status is not in the expected set and logs
`✅ 401 Unauthorized (expected 401 / actual 401)`:

```typescript
await scenario
  .step("Unauthenticated request is rejected", async (ctx) => {
    const response = await ctx.fetcher({
      path: "/tag/filter",
      expectStatus: 401, // or a list: [400, 422]
    });
    const body = await response.json();
    // assert on body...
  })
  .execute();
// Mismatch throws: "Expected status 401 but got 200 (GET https://api.example.com/tag/filter)"
```

To never throw and inspect the `Response` yourself, set `throwOnError: false`. A
mismatching status is then only logged as a red status line; it does not throw
and does not mark the scenario as failed, so assert on the `Response` yourself:

```typescript
const response = await ctx.fetcher({
  path: "/maybe-failing",
  throwOnError: false,
});
if (!response.ok) {
  console.log("Server returned", response.status);
}
```

### Logging

Every `ctx.fetcher()` call logs the request and response, including a preview of
the response body (truncated to 300 characters).

Binary responses (`application/octet-stream`, `application/x-protobuf`,
`image/*`, `audio/*`, `video/*`, `application/pdf`, `application/zip`, ...) are
never printed raw. They are summarized instead:

```
📥 [Binary Data] (123 bytes, application/octet-stream)
```

When the `Content-Type` header is missing or unknown, the first bytes are
sniffed: control characters or invalid UTF-8 mean binary.

Set `SF_LOG_BINARY=hex` to also print a hex dump of the first 64 bytes:

```bash
SF_LOG_BINARY=hex deno run --allow-net --allow-env scenario.ts
# 📥 [Binary Data] (123 bytes, application/x-protobuf)
# 📥 hex: 0a 05 68 65 6c 6c 6f 10 01 ...
```

Reading the variable requires `--allow-env`; without it the hex dump is simply
disabled (no error, no prompt).

## License

MIT
