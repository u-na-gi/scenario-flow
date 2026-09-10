# scenario-flow/core Test Suite

This directory contains the unit and integration tests for the scenario-flow
core modules.

## Test Files

- **`context.test.ts`** - Tests for the ScenarioFlowContext implementation
- **`index.test.ts`** - Tests for the main ScenarioFlow class
- **`type.test.ts`** - Tests for type definitions and interfaces, including
  compile-time checks of the typed scenario context (`ScenarioFlow<Ctx>`)
- **`inherit.test.ts`** - Regression tests for context isolation when a scenario
  inherits a parent (issue #8)
- **`config.test.ts`** - Tests for `apiBaseUrl` resolution (`resolveConfig`,
  `SF_API_BASE_URL` / custom `envKey` overrides, permission-safe env access)
- **`assert.test.ts`** - Tests for the `ctx.assert` helpers and
  `ScenarioAssertionError` (expected/actual, call-site location, logging)
- **`status.test.ts`** - Unit tests for the fetcher status-check helpers
  (`expectStatus` / `throwOnError` decision logic)
- **`expect-status.test.ts`** - Fetcher tests against a local `Deno.serve`
  server for `expectStatus` and `throwOnError`
- **`response-body.test.ts`** - Tests for response body classification (text vs
  binary), byte sniffing, hex dump formatting and logger output
- **`integration.test.ts`** - Integration tests that test modules working
  together, including binary responses against a local `Deno.serve` server
- **`permissions.ts`** - Shared helper (not a test) for gating tests on
  permissions, see below

## Running Tests

```bash
# Run all tests in the core module
cd scenario-flow
deno test

# Include the tests that need a local server / environment variables /
# file reads (they are ignored, not failed, without these permissions)
deno test --allow-net --allow-read --allow-env

# Run specific test file
deno test core/__tests__/context.test.ts

# Run tests with coverage
deno test --allow-net --allow-read --allow-env --coverage=coverage

# Run tests in watch mode
deno test --watch
```

## Permission Gating

A bare `deno test` must always pass. `Deno.test({ permissions })` can only
narrow the permissions the runner was started with, so a test that needs
`--allow-net`, `--allow-env` or `--allow-read` declares them and is ignored when
they were not granted. Use the helper in `permissions.ts` instead of querying
`Deno.permissions` by hand:

```ts
import { permissionTestOptions } from "./permissions.ts";

const netTest = permissionTestOptions({ net: true });

Deno.test({
  name: "talks to a local server",
  ...netTest,
}, async () => {
  // ...
});
```

`permissionTestOptions({ net, read, env })` returns `{ permissions, ignore }`:
the test runs with exactly the listed permissions (everything else revoked) and
`ignore` is `true` when any of them is not granted. `env` takes `true` or a list
of variable names. `hasPermissions(...)` is the underlying query if only the
boolean is needed.

Tests that need permissions today:

| Permission | Used by                                                                                                           |
| ---------- | ----------------------------------------------------------------------------------------------------------------- |
| `net`      | `Deno.serve` based tests in `expect-status`, `config`, `integration`                                              |
| `env`      | `SF_API_BASE_URL` / custom `envKey` tests in `config`, `SF_LOG_BINARY` tests in `response-body` and `integration` |
| `read`     | `assert` tests that check the source line at the call site                                                        |

## Test Features

### Mocking Strategy

- **Fetch Mocking**: Global fetch function is mocked for HTTP request testing
- **Response Simulation**: Different responses based on URL patterns
- **Error Simulation**: Network errors and HTTP error status codes
- **State Restoration**: Original fetch function is always restored after tests
- **Local Server**: Tests that need real HTTP semantics (status codes, binary
  bodies, env overrides of the base URL) start a `Deno.serve` on port `0`

### Test Patterns

- **Isolation**: Each test is independent and doesn't affect others
- **Cleanup**: Proper cleanup of global state (fetch, console.log, env) after
  each test
- **Assertions**: Comprehensive assertions for all expected behaviors
- **Error Testing**: Both positive and negative test cases

### Integration Testing

- **Real Workflow**: Tests simulate actual API interaction patterns
- **Context Sharing**: Validates data flow between steps
- **Error Propagation**: Ensures errors are properly handled and propagated
- **Chain Behavior**: Tests complex chaining scenarios

## Key Testing Areas

1. **Constructor Behavior**: Various initialization scenarios
2. **Method Chaining**: Fluent API functionality
3. **Async Operations**: Promise-based execution flow
4. **Error Handling**: Comprehensive error scenarios, including assertions
5. **Context Management**: Data sharing and isolation
6. **Configuration**: `apiBaseUrl` resolution and environment overrides
7. **URL Construction**: Path joining and formatting
8. **HTTP Integration**: Request/response handling, expected statuses, binary
   bodies
9. **Type Safety**: TypeScript interface compliance

## Notes

- Tests use Deno's built-in test framework with `@std/assert`
- Mock functions are used to isolate units under test
- Integration tests validate end-to-end functionality
- All tests include proper cleanup to prevent side effects
