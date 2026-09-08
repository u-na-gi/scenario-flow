# CI/CD Setup for Scenario Flow

This document describes the Continuous Integration setup for the Scenario Flow
project.

## Overview

The project uses GitHub Actions for automated testing, linting, and coverage
reporting. The CI pipeline runs on every push and pull request to the main and
develop branches.

## CI Pipeline Components

### 1. GitHub Actions Workflow (`.github/workflows/test.yml`)

The workflow includes three main jobs:

#### Test Job

- **Matrix Strategy**: Runs against Deno `latest` only (the matrix has a single
  entry; add versions to `deno-version` in `test.yml` to widen it)
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

- `test.yml` has no `workflow_dispatch` trigger; it cannot be started manually.
  Push to a branch or open a PR against `main`/`develop` instead.
- `publish.yml` has `workflow_dispatch` (owner only, see below) in addition to
  `v*` tag pushes.

## CI

### Owner-only gating

The repository is public, but GitHub Actions is intended to run only for the
repository owner. Every job in `test.yml` carries this guard:

```yaml
if: >-
  github.actor == github.repository_owner &&
  github.triggering_actor == github.repository_owner &&
  (github.event_name != 'pull_request' ||
  github.event.pull_request.head.repo.full_name == github.repository)
```

`publish.yml` has no `pull_request` trigger, so its job uses only the first two
clauses:

```yaml
if: >-
  github.actor == github.repository_owner &&
  github.triggering_actor == github.repository_owner
```

- Pushes, tag pushes and `workflow_dispatch` runs triggered by anyone other than
  the owner are skipped (every job is a no-op).
- `triggering_actor` also covers **Re-run jobs**: a future collaborator cannot
  re-run an owner-triggered workflow.
- Pull requests are additionally required to originate from a branch of this
  repository. A PR opened from a fork does not run any job, so fork code never
  executes with this repository's context.
- By design, CI is also skipped for bot-authored PRs (e.g. Dependabot, whose
  actor is `dependabot[bot]`) and for pushes by a collaborator onto the owner's
  PR branch. The owner must push (or re-run) to get a CI result in those cases.

Further hardening applied in the workflow files:

- Top-level `permissions: contents: read`; only the `publish` job adds
  `id-token: write` (OIDC for JSR, so no long-lived publish token is stored).
- `pull_request_target` is never used.
- Steps do not print environment variables (`env`, `printenv`, `set -x`) and no
  `SF_*` variable is set in CI; tests only talk to `localhost`.
- The Codecov upload receives `secrets.CODECOV_TOKEN` on that step only, with
  `fail_ci_if_error: false`. Since codecov-action v4, token-less uploads work
  only for fork PRs, so owner pushes need the token; if the secret is not set
  the upload is skipped and the pipeline still passes.
- Every third-party action is pinned to a full commit SHA with the version in a
  trailing comment. When upgrading, resolve the new SHA and update the comment.
- `concurrency` groups cancel superseded test runs; publish runs are serialised
  but never cancelled mid-flight.

### Repository settings (owner action, not in code)

These settings cannot be expressed in the workflow files and must be applied by
the owner in the GitHub UI:

1. **Settings → Actions → General → Approval for running fork pull request
   workflows from contributors**: select **Require approval for all external
   contributors**.
2. **Settings → Actions → General → Workflow permissions**: select **Read
   repository contents and packages permissions** (and leave "Allow GitHub
   Actions to create and approve pull requests" unchecked).
3. **Settings → Rules → Rulesets → New tag ruleset**: target `v*`; enable
   **Restrict creations**, **Restrict updates** and **Restrict deletions**; add
   **Repository admin** to the bypass list so only the owner can create release
   tags. This is what actually protects `publish.yml`, because the workflow runs
   on `v*` tag pushes.
4. **Settings → Secrets and variables → Actions**: add the `CODECOV_TOKEN`
   repository secret (from the Codecov project settings). Without it the
   coverage upload is skipped; CI still passes.
5. Keep other repository secrets minimal. JSR publishing uses OIDC, so no
   publish token is required.

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
