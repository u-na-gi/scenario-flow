# scenario-flow/core Test Suite

This directory contains comprehensive unit tests for the scenario-flow core
modules.

## Test Structure

### Test Files

- **`context.test.ts`** - Tests for the ScenarioFlowContext implementation
- **`index.test.ts`** - Tests for the main ScenarioFlow class
- **`type.test.ts`** - Tests for type definitions and interfaces
- **`store.test.ts`** - Tests for the store module
- **`integration.test.ts`** - Integration tests that test modules working
  together

## Test Coverage

### context.test.ts (8 tests)

- ✅ Context creation with `createCtx`
- ✅ Configuration retrieval
- ✅ Context data management (add/get)
- ✅ Generic type support
- ✅ Context merging functionality
- ✅ Fetcher function integration
- ✅ Initial state validation
- ✅ Context overwrite behavior

### index.test.ts (13 tests)

- ✅ Constructor with config
- ✅ Constructor with ScenarioFlowChain
- ✅ Constructor error handling
- ✅ Step method with functions
- ✅ Step method with chains
- ✅ Execution flow
- ✅ Error handling in steps
- ✅ Multiple step execution order
- ✅ URL joining functionality
- ✅ URL format handling
- ✅ HTTP error handling
- ✅ Chain copying behavior
- ✅ Context merging in chains

### type.test.ts (11 tests)

- ✅ ScenarioFlowConfig interface structure
- ✅ Various URL formats
- ✅ ScenarioFlowRequest basic structure
- ✅ RequestInit extension
- ✅ HTTP method support
- ✅ Empty URL paths
- ✅ Complex URL paths
- ✅ Query parameters
- ✅ Request body handling
- ✅ Special characters in URLs
- ✅ Minimal required properties

### store.test.ts (4 tests)

- ✅ Function existence and callability
- ✅ Error-free execution
- ✅ Multiple call support
- ✅ Function signature validation

### integration.test.ts (5 tests)

- ✅ Real-world workflow simulation (login → get user → get data)
- ✅ ScenarioFlow chaining with context sharing
- ✅ Error handling in complex scenarios
- ✅ Context isolation between instances
- ✅ Direct createCtx function usage

## Running Tests

```bash
# Run all tests in the core module
cd scenario-flow
deno test

# Run specific test file
deno test core/__tests__/context.test.ts

# Run tests with coverage
deno test --coverage=coverage

# Run tests in watch mode
deno test --watch
```

## Test Features

### Mocking Strategy

- **Fetch Mocking**: Global fetch function is mocked for HTTP request testing
- **Response Simulation**: Different responses based on URL patterns
- **Error Simulation**: Network errors and HTTP error status codes
- **State Restoration**: Original fetch function is always restored after tests

### Test Patterns

- **Isolation**: Each test is independent and doesn't affect others
- **Cleanup**: Proper cleanup of global state after each test
- **Assertions**: Comprehensive assertions for all expected behaviors
- **Error Testing**: Both positive and negative test cases

### Integration Testing

- **Real Workflow**: Tests simulate actual API interaction patterns
- **Context Sharing**: Validates data flow between steps
- **Error Propagation**: Ensures errors are properly handled and propagated
- **Chain Behavior**: Tests complex chaining scenarios

## Test Results

All 41 tests pass successfully:

- 8 context tests
- 13 index tests
- 11 type tests
- 4 store tests
- 5 integration tests

## Key Testing Areas

1. **Constructor Behavior**: Various initialization scenarios
2. **Method Chaining**: Fluent API functionality
3. **Async Operations**: Promise-based execution flow
4. **Error Handling**: Comprehensive error scenarios
5. **Context Management**: Data sharing and isolation
6. **URL Construction**: Path joining and formatting
7. **HTTP Integration**: Request/response handling
8. **Type Safety**: TypeScript interface compliance

## Notes

- Tests use Deno's built-in test framework with `@std/assert`
- Mock functions are used to isolate units under test
- Integration tests validate end-to-end functionality
- All tests include proper cleanup to prevent side effects
