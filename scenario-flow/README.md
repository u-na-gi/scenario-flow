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
- `config`: Configuration object containing `apiBaseUrl` (a string, a
  `() => string`, or `{ default, envKey? }` — see
  [Overriding the base URL](#overriding-the-base-url))

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
- `getConfig()`: Get the scenario configuration (`apiBaseUrl` is always a
  resolved `string` here)

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

## License

MIT
