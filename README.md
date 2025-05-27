# Scenario Flow

[![Test](https://github.com/u-na-gi/scenario-flow/actions/workflows/test.yml/badge.svg)](https://github.com/u-na-gi/scenario-flow/actions/workflows/test.yml)
[![codecov](https://codecov.io/gh/u-na-gi/scenario-flow/branch/main/graph/badge.svg)](https://codecov.io/gh/u-na-gi/scenario-flow)
[![Deno](https://img.shields.io/badge/deno-1.40+-blue.svg)](https://deno.land/)

A scenario-based API flow testing tool built with Deno.

**注意: このプロジェクトは現在開発中のため、使用には注意してください。**\
**Note: This project is currently under development. Use with caution.**

## Installation

### Prerequisites

First, install Deno:

```bash
curl -fsSL https://deno.land/install.sh | sh
```

### Scenario Flow Library

Add the library to your project's `deno.json`:

```json
{
  "imports": {
    "scenario-flow": "https://raw.githubusercontent.com/u-na-gi/scenario-flow/main/scenario-flow/mod.ts"
  }
}
```

### Scenario Flow CLI

Install the CLI tool globally:

```bash
deno install --global -A -n sfcli https://raw.githubusercontent.com/u-na-gi/scenario-flow/main/scenario-flow-cli/main.ts
```

## Usage

### Using the Library

Create a scenario file (e.g., `login.sf.ts`):

```typescript
import { ScenarioFlow } from "scenario-flow";

export const login = new ScenarioFlow({
  apiBaseUrl: "http://localhost:3000/",
}).step(async (ctx) => {
  const res = await ctx.fetcher({
    method: "POST",
    urlPaths: ["login"],
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
    ctx.addContext("token", data.token);
  }
});

if (import.meta.main) {
  await login.execute();
}
```

### Using the CLI

The CLI tool automatically finds and executes all `.sf.ts` files in a directory:

```bash
# Show help
sfcli -h

# Run all .sf.ts files in current directory
sfcli .

# Run all .sf.ts files in specified directory
sfcli ./scenarios
```

#### CLI Features

- 🔍 **Recursive search** for `.sf.ts` files
- 🌐 **Automatic network permissions** (`--allow-net`)
- 📊 **Execution summary** and error reporting
- 🛠️ **Easy installation** and global access

## Examples

### Basic API Test

```typescript
import { ScenarioFlow } from "scenario-flow";

const apiTest = new ScenarioFlow({
  apiBaseUrl: "https://api.example.com/",
})
  .step(async (ctx) => {
    // First step: Login
    const loginRes = await ctx.fetcher({
      method: "POST",
      urlPaths: ["auth", "login"],
      body: JSON.stringify({ username: "test", password: "test" }),
    });

    const { token } = await loginRes.json();
    ctx.addContext("authToken", token);
  })
  .step(async (ctx) => {
    // Second step: Get user data
    const token = ctx.getContext<string>("authToken");

    const userRes = await ctx.fetcher({
      method: "GET",
      urlPaths: ["user", "profile"],
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
echo 'import { ScenarioFlow } from "scenario-flow"; ...' > scenarios/test.sf.ts

# Run all scenarios
sfcli scenarios

# Output:
# Searching for .sf.ts files in: scenarios
# Found 1 .sf.ts files:
# - /path/to/scenarios/test.sf.ts
# Executing: /path/to/scenarios/test.sf.ts
# Successfully executed: /path/to/scenarios/test.sf.ts
# Execution summary: 1/1 files executed successfully.
```

## Testing

This project includes comprehensive unit tests for all core modules.

### Running Tests

```bash
# Run all tests
deno task test

# Run core library tests with coverage
deno task test:core

# Run CLI tests
deno task test:cli

# Generate coverage report
deno task test:coverage

# Run CI pipeline locally
deno task ci
```

### Test Coverage

The test suite includes:

- **41 unit tests** covering all core functionality
- **Integration tests** for real-world scenarios
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

# Run all tests
deno task test

# Run examples
cd example
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
