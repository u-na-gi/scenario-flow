# scenario-flow

A TypeScript library for scenario-based testing and automation that provides a
fluent API for building and executing API test scenarios.

## Features

- 🔗 **Fluent API**: Chain multiple steps together for readable test scenarios
- 📝 **Built-in Logging**: Automatic request/response logging with timing
- 🔧 **Context Management**: Share data between steps with built-in context
- 🚀 **TypeScript Support**: Full type safety with TypeScript
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
    ctx.addContext("authToken", data.token);
  })
  .step("Get user profile", async (ctx) => {
    const token = ctx.getContext<string>("authToken");

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

## API Reference

### ScenarioFlow

The main class for creating and executing test scenarios.

#### Constructor

```typescript
new ScenarioFlow(name: string, config: ScenarioFlowConfig)
```

- `name`: A descriptive name for the scenario
- `config`: Configuration object containing `apiBaseUrl`

#### Methods

##### `.step(name: string, fn: ScenarioFlowStepFunction): ScenarioFlowChain`

Add a step to the scenario.

- `name`: Step name for logging
- `fn`: Async function that receives the context

##### `.execute(): Promise<void>`

Execute all steps in the scenario.

### Context Methods

The context object passed to each step provides:

- `fetcher(request)`: Make HTTP requests
- `addContext(key, value)`: Store data for later steps
- `getContext<T>(key)`: Retrieve stored data
- `getConfig()`: Get the scenario configuration

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
