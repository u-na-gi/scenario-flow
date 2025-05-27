# CI/CD Setup for Scenario Flow

This document describes the Continuous Integration setup for the Scenario Flow project.

## Overview

The project uses GitHub Actions for automated testing, linting, and coverage reporting. The CI pipeline runs on every push and pull request to the main and develop branches.

## CI Pipeline Components

### 1. GitHub Actions Workflow (`.github/workflows/test.yml`)

The workflow includes three main jobs:

#### Test Job

- **Matrix Strategy**: Tests against multiple Deno versions (1.40.x, 1.41.x, latest)
- **Code Quality**: Runs formatting checks and linting
- **Core Tests**: Executes 41 unit tests for scenario-flow/core with coverage
- **CLI Tests**: Tests the command-line interface functionality
- **Coverage**: Generates and uploads coverage reports to Codecov

#### Test Examples Job

- **TypeScript Validation**: Checks example scenario files
- **CLI Integration**: Validates CLI with example scenarios

#### Security Audit Job

- **Dependency Check**: Scans for vulnerabilities in dependencies
- **Import Integrity**: Validates import integrity

### 2. Project Configuration (`deno.json`)

#### Tasks

- `test:core` - Run core library tests with coverage
- `test:cli` - Run CLI tests
- `test:coverage` - Generate coverage reports
- `ci` - Complete CI pipeline (format check + lint + tests)

#### Linting Configuration

- Excludes problematic rules for test files
- Excludes example directories from strict linting
- Focuses on core library code quality

#### Formatting

- Consistent code style across the project
- 2-space indentation, semicolons, double quotes
- 100 character line width

## Test Coverage

### Current Coverage

- **Overall**: 98.0% line coverage, 94.4% branch coverage
- **context.ts**: 100% coverage
- **index.ts**: 97.1% line coverage, 94.4% branch coverage
- **store.ts**: 100% coverage

### Test Suite Statistics

- **41 total tests** across 5 test files
- **8 context tests** - ScenarioFlowContext functionality
- **13 index tests** - Main ScenarioFlow class
- **11 type tests** - Type definitions and interfaces
- **4 store tests** - Store module functionality
- **5 integration tests** - End-to-end scenarios

## Running Tests Locally

### Prerequisites

```bash
# Install Deno
curl -fsSL https://deno.land/install.sh | sh
```

### Commands

```bash
# Run complete CI pipeline locally
deno task ci

# Run individual test suites
deno task test:core      # Core library tests
deno task test:cli       # CLI tests
deno task test:coverage  # Generate coverage report

# Code quality checks
deno task fmt:check      # Check formatting
deno task lint          # Run linter
```

## CI Status Badges

The project README includes status badges for:

- **Test Status**: Shows current CI pipeline status
- **Coverage**: Shows test coverage percentage
- **Deno Version**: Shows supported Deno versions

## Coverage Reporting

### Codecov Integration

- Automatic coverage upload on CI runs
- Coverage reports available at codecov.io
- Fails gracefully if upload fails (doesn't break CI)

### Local Coverage

- HTML reports generated in `scenario-flow/coverage/html/`
- LCOV format for integration with other tools
- Coverage thresholds: 94%+ branch, 98%+ line coverage

## Workflow Triggers

### Automatic Triggers

- **Push** to main or develop branches
- **Pull Requests** targeting main or develop branches

### Manual Triggers

- Can be triggered manually from GitHub Actions tab
- Useful for testing CI changes

## Best Practices

### For Contributors

1. **Run CI locally** before pushing: `deno task ci`
2. **Maintain test coverage** above current thresholds
3. **Follow formatting rules** enforced by CI
4. **Add tests** for new functionality

### For Maintainers

1. **Monitor CI status** on all PRs
2. **Review coverage reports** for significant changes
3. **Update CI configuration** as project evolves
4. **Keep dependencies updated** for security

## Troubleshooting

### Common Issues

1. **Formatting failures**: Run `deno fmt` to fix
2. **Lint errors**: Check excluded rules in `deno.json`
3. **Test failures**: Run tests locally to debug
4. **Coverage drops**: Add tests for new code

### CI Debugging

- Check GitHub Actions logs for detailed error messages
- Use matrix strategy to isolate Deno version issues
- Verify permissions for external integrations

## Future Enhancements

### Planned Improvements

- **Performance testing** integration
- **Security scanning** with additional tools
- **Automated releases** on version tags
- **Multi-platform testing** (Windows, macOS, Linux)

### Monitoring

- **CI performance** tracking
- **Test execution time** optimization
- **Coverage trend** analysis
