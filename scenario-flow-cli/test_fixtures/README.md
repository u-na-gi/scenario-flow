# Test fixtures

These files are used by `../main_test.ts` and are not real scenarios.

- `basic/` - `pass.sf.ts` succeeds, `nested/fail.sf.ts` **deliberately throws**,
  `not-a-scenario.ts` must never be picked up
- `empty/` - contains no `.sf.ts` file
- `concurrent/` - two files with different run times, used to verify that
  `--concurrency` never interleaves output
- `env/` - prints `SF_API_BASE_URL`, used to verify `--base-url`

Because `basic/nested/fail.sf.ts` always fails, running `sfcli .` from the
repository root (or from `scenario-flow-cli/`) reports one failed file and exits
with 1. Point `sfcli` at your scenario directory instead, or exclude this
directory with `--filter`.
