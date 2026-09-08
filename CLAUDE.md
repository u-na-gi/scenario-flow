# scenario-flow — contributor and agent guide

## Language

- **Everything in this repository is written in English**: source code,
  comments, JSDoc, READMEs, `docs/`, examples, test names, commit messages, PR
  titles and descriptions.
- Non-ASCII text (Japanese, emoji in log output, etc.) is allowed **only** as
  test fixtures or sample data, e.g. multibyte strings used to test encoding or
  binary sniffing.
- Issue and PR _discussion_ may follow the language of the thread it is in.

## Layout

Deno workspace (`deno.json` at the root) with three members:

| Path                 | What it is                                                          |
| -------------------- | ------------------------------------------------------------------- |
| `scenario-flow/`     | The library, published to JSR as `@u-na-gi/scenario-flow`           |
| `scenario-flow-cli/` | The `sfcli` CLI that discovers and runs `*.sf.ts` scenario files    |
| `example/`           | Sample API server (`sample-api/server.ts`) and example scenarios    |
| `scenario-flow-ext/` | VS Code extension (separate npm/pnpm project, not in the workspace) |

Library source lives in `scenario-flow/core/`; the public surface is
`scenario-flow/mod.ts`. Export from `mod.ts` explicitly — avoid `export *` for
modules that contain internal helpers.

## Commands

Run from the repository root unless noted.

```bash
deno fmt                      # format (CI runs `deno fmt --check`)
deno lint                     # lint (must be clean; `no-import-prefix` is enforced)
cd scenario-flow && deno test --allow-net --allow-read --allow-env
cd scenario-flow-cli && deno task test
deno check scenario-flow/mod.ts example/scenario/*.sf.ts
```

Example scenarios need the sample server: `cd example && deno task server:start`
(port 3323), then `deno task test`.

## Conventions

- **Imports**: use jsr bare specifiers declared in the member's `deno.json`
  (`@std/assert`, `@std/path`, ...). Do not use `https://deno.land/...` URL
  imports.
- **Tests**: library tests live in `scenario-flow/core/__tests__/*.test.ts`; CLI
  tests in `scenario-flow-cli/main_test.ts` with fixtures under
  `scenario-flow-cli/test_fixtures/`. Tests that need `env`/`net` permissions
  must not break a bare `deno test`: declare `permissions` on the test and
  `ignore` it when the permission is not granted (`Deno.permissions.querySync`).
- **Permissions**: library code must never throw or prompt when a permission is
  missing. Guard `Deno.env.get` with `Deno.permissions.querySync` and fall back
  silently.
- **Environment variables** understood by the library/CLI are prefixed `SF_`
  (`SF_API_BASE_URL`, `SF_LOG_BINARY`).
- **Backward compatibility**: keep default behaviour unchanged; add opt-in
  options rather than changing defaults. Deprecate with `@deprecated` and keep a
  delegating alias for at least one minor version.
- **Logging**: user-facing output goes through `scenario-flow/core/logger.ts`.

## Workflow

- Branch per issue (`issue/<number>-<slug>`), PR into `main`. Reference the
  issue in the PR.
- Write design decisions, alternatives considered, and review outcomes as
  comments on the issue and in the PR description, so the reasoning stays
  discoverable.
- **Do not publish, tag (`v*`), or bump the version** unless explicitly asked.
  Pushing a `v*` tag triggers the JSR publish workflow.
