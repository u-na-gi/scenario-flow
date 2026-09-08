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

**Inheriting copies the context; it is never shared.** A child scenario gets its
own context object (seeded with a shallow copy of the values the parent holds at
construction time) and its own copy of the config. The parent's steps run again
inside the child's `execute()` against the child's context, so two children of
the same parent (e.g. many scenarios built on `login`) never see each other's
values, and children never write into the parent's context.

An untyped scenario (no type argument) behaves like `Record<string, unknown>`:
any key is allowed, `getContext(key)` returns `unknown` and `getContext<T>(key)`
returns `T | undefined`. Combining a typed and an untyped scenario keeps the
typed side (`InheritedContext<Parent, Own>`).

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
- `config`: Configuration object containing `apiBaseUrl`
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
- `getConfig()`: Get the scenario configuration
- `addContext(key, value)`: Deprecated alias of `setContext`

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

## License

MIT
