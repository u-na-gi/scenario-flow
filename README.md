# Scenario Flow

[![Test](https://github.com/u-na-gi/scenario-flow/actions/workflows/test.yml/badge.svg)](https://github.com/u-na-gi/scenario-flow/actions/workflows/test.yml)
[![codecov](https://codecov.io/gh/u-na-gi/scenario-flow/branch/main/graph/badge.svg)](https://codecov.io/gh/u-na-gi/scenario-flow)
[![Deno](https://img.shields.io/badge/deno-1.40+-blue.svg)](https://deno.land/)

A scenario-based API flow testing tool built with Deno.

**Note: This project is currently under development. Use with caution.**

## Installation

### Prerequisites

First, install Deno:

```bash
curl -fsSL https://deno.land/install.sh | sh
```

### Scenario Flow Library

The library is published to JSR as
[`@u-na-gi/scenario-flow`](https://jsr.io/@u-na-gi/scenario-flow). Add it to
your project:

```bash
deno add jsr:@u-na-gi/scenario-flow
```

and import it as `@u-na-gi/scenario-flow`:

```typescript
import { ScenarioFlow } from "@u-na-gi/scenario-flow";
```

### Scenario Flow CLI

The `sfcli` command is installed from a clone of this repository:

```bash
git clone https://github.com/u-na-gi/scenario-flow.git
cd scenario-flow/scenario-flow-cli
deno task install
```

This runs `deno install --global --allow-read --allow-run -n sfcli main.ts`. See
[scenario-flow-cli/README.md](scenario-flow-cli/README.md) for details.

## Usage

### Using the Library

Create a scenario file (e.g., `login.sf.ts`):

```typescript
import { ScenarioFlow } from "@u-na-gi/scenario-flow";

// Declare the context shape: setContext / getContext are typed by it
export type LoginCtx = { token: string };

export const login = new ScenarioFlow<LoginCtx>("User Login", {
  apiBaseUrl: "http://localhost:3000/",
}).step("Exec Login", async (ctx) => {
  const res = await ctx.fetcher({
    method: "POST",
    path: "/login",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      username: "testuser",
      password: "password",
    }),
  });

  if (res.ok) {
    const data = await res.json();
    console.log("Login successful:", data);
    ctx.setContext("token", data.token); // must be a string
  }
});

if (import.meta.main) {
  await login.execute();
}
```

Another scenario can build on `login` (e.g. `get-data.sf.ts`):

```typescript
import { ScenarioFlow } from "@u-na-gi/scenario-flow";
import { login } from "./login.sf.ts";

// Inherits login's steps and context type; use login.extend<Own>(name)
// to add your own context keys on top (LoginCtx & Own).
const getData = new ScenarioFlow("Get some data", login)
  .step("Get authorized data", async (ctx) => {
    const token = ctx.getContext("token"); // string | undefined
    if (!token) throw new Error("Token not found");

    await ctx.fetcher({
      method: "GET",
      path: "/api/data",
      headers: { "Authorization": `Bearer ${token}` },
    });
  });

if (import.meta.main) {
  await getData.execute();
}
```

A child scenario gets its own copy of the parent's context (and config): a
shallow snapshot taken at construction, so top-level values are copied but
nested objects are shared. The parent's steps run again inside each child's
`execute()` against that child's context. Scenarios that share a parent never
leak top-level values into each other or into the parent.

Without a type argument the context is untyped: any key is accepted and
`ctx.getContext<T>(key)` returns `T | undefined`. See
[scenario-flow/README.md](./scenario-flow/README.md) for the full API.

### Using the CLI

The CLI tool finds and executes `.sf.ts` files:

```bash
# Show help
sfcli -h

# Run all .sf.ts files in current directory
sfcli .

# Run all .sf.ts files in specified directory
sfcli ./scenarios

# Run single files, several paths, or shell globs
sfcli ./scenarios/login.sf.ts ./other-scenarios
sfcli ./scenarios/*.sf.ts

# Only run files whose path matches a substring or /regex/
sfcli --filter login ./scenarios

# Run 4 scenario files in parallel (output is printed per file, never mixed)
sfcli -c 4 ./scenarios

# Override apiBaseUrl of every scenario
sfcli --base-url http://localhost:8080/ ./scenarios
```

#### Overriding the base URL

The `apiBaseUrl` written in a scenario can be overridden at run time, so the
same scenario files can target a local server, staging, or production:

```bash
# via environment variable
SF_API_BASE_URL=https://staging.example.com sfcli ./scenario-test

# via the CLI flag (sets SF_API_BASE_URL for the scenario processes)
sfcli --base-url https://staging.example.com ./scenario-test
```

A non-empty `SF_API_BASE_URL` takes precedence over the value in the scenario.
To use a custom variable name, pass the object form:

```typescript
new ScenarioFlow("Login", {
  apiBaseUrl: { default: "http://localhost:3000", envKey: "MY_API_URL" },
});
```

`apiBaseUrl` also accepts a `() => string`, called once when the scenario is
constructed. See
[scenario-flow/README.md](./scenario-flow/README.md#overriding-the-base-url) for
the full resolution rules.

#### CLI Features

- 🔍 **Recursive search** for `.sf.ts` files, plus single files, multiple paths
  and globs (sorted, de-duplicated)
- 🎯 **`--filter`** by substring or `/regex/`
- ⚡ **`-c, --concurrency <n>`** to run files in parallel without interleaved
  logs
- 🌐 **`--base-url <url>`** (or `SF_API_BASE_URL`) to override `apiBaseUrl`
- 🚦 **Exit code** `1` when any scenario fails or no files are found
  (`--allow-empty` to tolerate an empty result)
- 📊 **Execution summary** and error reporting
- 🛠️ **Easy installation** and global access

See [scenario-flow-cli/README.md](scenario-flow-cli/README.md) for all options.

## Examples

### Basic API Test

```typescript
import { ScenarioFlow } from "@u-na-gi/scenario-flow";

const apiTest = new ScenarioFlow("API Test", {
  apiBaseUrl: "https://api.example.com/",
})
  .step("Login", async (ctx) => {
    // First step: Login
    const loginRes = await ctx.fetcher({
      method: "POST",
      path: "/auth/login",
      body: JSON.stringify({ username: "test", password: "test" }),
    });

    const { token } = await loginRes.json();
    ctx.setContext("authToken", token);
  })
  .step("Get user data", async (ctx) => {
    // Second step: Get user data (untyped context: pass the value type)
    const token = ctx.getContext<string>("authToken");

    const userRes = await ctx.fetcher({
      method: "GET",
      path: "/user/profile",
      headers: {
        "Authorization": `Bearer ${token}`,
      },
    });

    const userData = await userRes.json();
    console.log("User data:", userData);
  });

if (import.meta.main) {
  await apiTest.execute();
}
```

### Running with CLI

```bash
# Create your scenario files
mkdir scenarios
echo 'import { ScenarioFlow } from "@u-na-gi/scenario-flow"; ...' > scenarios/test.sf.ts

# Run all scenarios
sfcli scenarios

# Output:
# 🔍 Searching for .sf.ts files in: scenarios
# ✅ Found 1 .sf.ts files:
#   📄 /path/to/scenarios/test.sf.ts
#
# ▶ Running: /path/to/scenarios/test.sf.ts
# ... scenario and step logs ...
#
# ============================================================
# 📊 EXECUTION SUMMARY
# ============================================================
# 🎉 1/1 scenarios executed successfully
# ⏱️  Total execution time: 1.2s
# ============================================================
```

## Testing

This project includes unit and integration tests for the library and the CLI.

### Running Tests

Run from the repository root:

```bash
# Format and lint (CI runs `deno fmt --check`)
deno fmt
deno lint

# Core library tests (tests that need net/env/read are skipped without
# these flags, so a bare `deno test` also passes)
cd scenario-flow && deno test --allow-net --allow-read --allow-env

# CLI tests
cd scenario-flow-cli && deno task test

# Type-check the public API and the example scenarios
deno check scenario-flow/mod.ts example/scenario/*.sf.ts
```

### Test Coverage

The test suite includes:

- **Unit tests** covering the core functionality
- **Integration tests** for real-world scenarios against a local server
- **Error handling tests** for robust error management
- **Type safety tests** for TypeScript compliance
- **Mock-based testing** for isolated unit testing

Test files are located in:

- `scenario-flow/core/__tests__/` - Core library tests
- `scenario-flow-cli/main_test.ts` - CLI functionality tests

## Development

### Local Development

```bash
# Clone the repository
git clone https://github.com/u-na-gi/scenario-flow.git
cd scenario-flow

# Run the library tests
cd scenario-flow
deno test --allow-net --allow-read --allow-env
cd ..

# Run examples (the sample API server must be running on localhost:3323)
cd example
deno task server:start   # in another terminal
deno task test

# Run CLI tests
cd ../scenario-flow-cli
deno task test
```

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License.
