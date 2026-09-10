# Test fixtures

These files are used by `../main_test.ts` and are not real scenarios.

- `basic/` - `pass.sf.ts` succeeds, `nested/fail.sf.ts` **deliberately throws**,
  `not-a-scenario.ts` must never be picked up
- `empty/` - contains no `.sf.ts` file
- `concurrent/` - two files with different run times, used to verify that
  `--concurrency` never interleaves output
- `env/` - prints `SF_API_BASE_URL`, used to verify `--base-url`
- `setup/` - `setup.sf.ts` seeds a context, `use-context.sf.ts` asserts that it
  received that context through `SF_CONTEXT_FILE`; used to verify `--setup`
  (`use-context.sf.ts` **fails** when run without `--setup`)
- `setup-fail/` - `setup.sf.ts` **deliberately throws**, used to verify that a
  failing `--setup` file aborts the run

Because `basic/nested/fail.sf.ts`, `setup/use-context.sf.ts` and
`setup-fail/setup.sf.ts` always fail on their own, running `sfcli .` from the
repository root (or from `scenario-flow-cli/`) reports failed files and exits
with 1. Point `sfcli` at your scenario directory instead, or exclude this
directory with `--filter`.
