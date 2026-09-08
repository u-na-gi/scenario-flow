# Scenario Flow CLI (sfcli)

A command-line tool for finding and executing ScenarioFlow files (`.sf.ts`) with
network permissions.

## Installation

### Global Installation

```bash
cd scenario-flow-cli
deno task install
```

This will install the `sfcli` command globally, making it available from
anywhere on your system.

### Local Usage

```bash
cd scenario-flow-cli
deno task start [directory]
```

## Usage

```
sfcli [OPTIONS] [PATH...]
```

### Arguments

| Argument  | Description                                                                                                                              |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `PATH...` | One or more files or directories (default: `.`). Directories are searched recursively for `*.sf.ts` files; files must end with `.sf.ts`. |

Shell globs work as expected because they expand to multiple file arguments
(`sfcli ./scenarios/*.sf.ts`). Duplicate files are run only once and the final
file list is sorted by path, so execution order is deterministic.

### Options

| Option                  | Description                                                                                                                                                                                                                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `-h, --help`            | Show help and exit with 0.                                                                                                                                                                                                                                                    |
| `-c, --concurrency <n>` | Run up to `n` scenario files in parallel (default: `1`, sequential). With `n > 1`, each file's stdout/stderr is buffered and printed as one block when that file finishes, so logs never mix. Blocks of passed files are written to stdout, blocks of failed files to stderr. |
| `--filter <pattern>`    | Only run files whose path, relative to the current directory, contains `pattern`. Use `/regex/` or `/regex/i` for a regular-expression match. Only one `--filter` is honoured.                                                                                                |
| `--base-url <url>`      | Pass `SF_API_BASE_URL=<url>` to every scenario process, which overrides the scenario's `apiBaseUrl`. Setting `SF_API_BASE_URL` in the environment before running `sfcli` works too.                                                                                           |
| `--setup <file>`        | Run `<file>` (a `.sf.ts` file) first and alone; its context is handed to every other scenario file as initial context (see [Running a setup file once](#running-a-setup-file-once)). If it fails, nothing else runs and `sfcli` exits with 1.                                 |
| `--allow-empty`         | Exit with 0 even when no `.sf.ts` files are found.                                                                                                                                                                                                                            |

### Exit code

| Code | Meaning                                                                                                                                        |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `0`  | All scenario files succeeded (or `--help`, or no files with `--allow-empty`).                                                                  |
| `1`  | At least one scenario file failed, the `--setup` file failed, a path did not exist / was not a `.sf.ts` file, or no `.sf.ts` files were found. |

### Examples

```bash
# Show help
sfcli -h

# Run all .sf.ts files in the current directory
sfcli .

# Run all .sf.ts files in a directory
sfcli ./path/to/scenarios

# Run a single file, or several files and directories at once
sfcli ./scenarios/login.sf.ts
sfcli ./scenarios/*.sf.ts ./more-scenarios

# Only run files whose path contains "login"
sfcli --filter login ./scenarios

# Regex filter (case-insensitive)
sfcli --filter '/user|auth/i' ./scenarios

# Run four files at a time; output of each file is printed as one block
# (passed files on stdout, failed files on stderr)
sfcli -c 4 ./scenarios
sfcli -c 4 ./scenarios 2>failures.log   # keep only failure traces

# Point every scenario at another server
sfcli --base-url http://localhost:8080/ ./scenarios
SF_API_BASE_URL=http://localhost:8080/ sfcli ./scenarios

# Do not fail when the directory contains no scenarios
sfcli --allow-empty ./maybe-empty

# Run setup.sf.ts (e.g. register + login) once, then every other file with
# the context it produced
sfcli --setup ./scenarios/setup.sf.ts ./scenarios
```

### Running a setup file once

Every scenario file runs in its own `deno run` process, so a parent chain such
as `registerUser → login` inherited by many scenarios is re-executed in each of
them. `--setup <file>` runs one file first and shares its context with the rest:

1. A temporary JSON file is created.
2. The setup file runs alone with `SF_CONTEXT_OUT=<tmp>` (and
   `--allow-write=<tmp>`). After each successful `execute()` the library writes
   the scenario's context to that file. If the setup file exits non-zero,
   `sfcli` prints `Setup failed`, runs nothing else and exits with `1`.
3. The remaining files (the setup file is excluded even when it lives under one
   of the given paths) run with `SF_CONTEXT_FILE=<tmp>` (and
   `--allow-read=<tmp>`); every top-level `ScenarioFlow` in them starts with the
   values from that file in its context. `--concurrency`, `--filter` and
   `--base-url` apply as usual.
4. The temporary file is deleted, also when a step fails or the run is
   interrupted with Ctrl+C (exit code 130).

`sfcli` itself needs write access to the OS temp directory for that file. The
default install (`deno task install`) grants only `--allow-read --allow-run`: an
interactive run then prompts once for exactly that directory, while a
non-interactive run (CI, `--no-prompt`) prints a clear error and exits with `1`.
To avoid the prompt, pass the directory explicitly and nothing more:

```bash
deno install --global --allow-read --allow-run --allow-write=/tmp -n sfcli main.ts
# or for one run
deno run --allow-read --allow-run --allow-write="$TMPDIR" main.ts --setup setup.sf.ts ./scenarios
```

Only JSON-serializable context values (strings, numbers, booleans, arrays, plain
objects, ...) are carried over; functions, `Response` objects and the like are
dropped. See [Running setup once](../scenario-flow/README.md#running-setup-once)
in the library README for the environment variables and for `parent.once()`, the
in-process variant.

## What it does

The CLI tool:

1. **Resolves each PATH**: a directory is searched recursively for `.sf.ts`
   files, a file is used as-is (it must end with `.sf.ts`)
2. **Sorts and de-duplicates** the file list, then applies `--filter`
3. **Runs the `--setup` file first** (if given) and saves its context to a
   temporary file
4. **Executes each file** using `deno run --allow-net --allow-env <file>`, up to
   `--concurrency` files at a time
5. **Reports results** showing which files were executed successfully and
   **exits non-zero** if anything failed

## Features

- ✅ Recursive directory scanning, single files, multiple paths and globs
- ✅ Deterministic (sorted) execution order
- ✅ `--filter` by substring or regular expression
- ✅ Parallel execution with `--concurrency`, without interleaved logs
- ✅ `--base-url` / `SF_API_BASE_URL` override for the target server
- ✅ `--setup` to run a login/registration chain once per run
- ✅ Automatic network permission (`--allow-net`)
- ✅ Meaningful exit code for CI
- ✅ Clear execution feedback, error handling and reporting
- ✅ Help documentation
- ✅ Global installation support

## Development

### Running Tests

```bash
deno task test
```

### Development Mode

```bash
deno task dev
```

## Requirements

- Deno runtime
- Network access for executing ScenarioFlow files
- Read permissions for file system scanning
- Run permissions for executing Deno commands
- Write permission for the OS temp directory when using `--setup`
  (`--allow-write=/tmp`; see
  [Running a setup file once](#running-a-setup-file-once))
