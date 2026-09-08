#!/usr/bin/env -S deno run --allow-read --allow-run

import { resolve } from "@std/path";
import { walk } from "@std/fs";
import { parseArgs } from "@std/cli/parse-args";
import { logger } from "../scenario-flow/core/logger.ts";

/**
 * Parsed command-line options.
 */
export interface CliOptions {
  help: boolean;
  paths: string[];
  filter?: string;
  concurrency: number;
  allowEmpty: boolean;
  baseUrl?: string;
}

/**
 * Result of executing one scenario file.
 */
interface ScenarioResult {
  file: string;
  success: boolean;
  durationMs: number;
  /** Captured stdout (only when output is buffered). */
  stdout?: string;
  /** Captured stderr (only when output is buffered). */
  stderr?: string;
}

/**
 * Prints the help message for the CLI
 */
function printHelp(): void {
  console.log(`
scenario-flow-cli (sfcli)

USAGE:
  sfcli [OPTIONS] [PATH...]

ARGUMENTS:
  PATH                     One or more files or directories (default: ".").
                           Directories are searched recursively for *.sf.ts
                           files. Files must end with ".sf.ts".

OPTIONS:
  -h, --help               Show this help message
  -c, --concurrency <n>    Run up to <n> scenario files in parallel
                           (default: 1). When n > 1, each file's output is
                           buffered and printed as one block when the file
                           finishes, so logs of different files never mix.
      --filter <pattern>   Only run files whose path contains <pattern>.
                           Use /regex/ (optionally /regex/i) for a regular
                           expression match.
      --base-url <url>     Override apiBaseUrl of every scenario by passing
                           SF_API_BASE_URL=<url> to the child processes.
      --allow-empty        Exit with 0 even when no .sf.ts files are found.

EXIT CODE:
  0  all scenario files succeeded
  1  at least one scenario file failed, a path was invalid, or no
     .sf.ts files were found (unless --allow-empty)

DESCRIPTION:
  Finds all .sf.ts files under the given paths (sorted, de-duplicated) and
  executes each of them with 'deno run --allow-net --allow-env'.

EXAMPLES:
  sfcli .                            # Run all .sf.ts files in current directory
  sfcli ./scenarios ./more/login.sf.ts   # Mix directories and single files
  sfcli ./scenarios/*.sf.ts          # Shell globs work as multiple files
  sfcli --filter login ./scenarios   # Only files whose path contains "login"
  sfcli --filter /user|auth/ .       # Regex filter
  sfcli -c 4 ./scenarios             # Run 4 files at a time
  sfcli --base-url http://localhost:8080/ ./scenarios
`);
}

/**
 * Parses command-line arguments.
 * Throws an Error with a user-facing message on invalid input.
 */
export function parseCliArgs(args: string[]): CliOptions {
  const unknownFlags: string[] = [];
  const parsed = parseArgs(args, {
    boolean: ["help", "allow-empty"],
    string: ["concurrency", "filter", "base-url"],
    alias: { h: "help", c: "concurrency" },
    unknown: (arg: string, key?: string) => {
      // Positional arguments (no key) are accepted; unknown flags are not.
      if (key !== undefined) {
        unknownFlags.push(arg);
        return false;
      }
      return true;
    },
  });

  if (unknownFlags.length > 0) {
    throw new Error(
      `Unknown option(s): ${unknownFlags.join(", ")}. See --help.`,
    );
  }

  let concurrency = 1;
  if (parsed.concurrency !== undefined) {
    concurrency = Number(parsed.concurrency);
    if (
      parsed.concurrency === "" || !Number.isInteger(concurrency) ||
      concurrency < 1
    ) {
      throw new Error(
        `--concurrency must be a positive integer (got "${parsed.concurrency}")`,
      );
    }
  }

  if (parsed.filter === "") {
    throw new Error("--filter requires a pattern");
  }
  if (parsed["base-url"] === "") {
    throw new Error("--base-url requires a URL");
  }

  const paths = parsed._.map(String);

  return {
    help: parsed.help,
    paths: paths.length > 0 ? paths : ["."],
    filter: parsed.filter,
    concurrency,
    allowEmpty: parsed["allow-empty"],
    baseUrl: parsed["base-url"],
  };
}

/**
 * Builds a predicate from a --filter pattern.
 * `/.../` (with optional flags) is treated as a regular expression,
 * anything else as a plain substring match.
 */
export function buildFilter(pattern: string): (path: string) => boolean {
  const regexMatch = pattern.match(/^\/(.+)\/([a-z]*)$/);
  if (regexMatch) {
    const regex = new RegExp(regexMatch[1], regexMatch[2]);
    return (path) => regex.test(path);
  }
  return (path) => path.includes(pattern);
}

/**
 * Resolves the given paths (files or directories) to a sorted,
 * de-duplicated list of absolute .sf.ts file paths.
 * Invalid paths are reported in `errors` instead of throwing.
 */
export async function collectScenarioFiles(
  paths: string[],
): Promise<{ files: string[]; errors: string[] }> {
  const files = new Set<string>();
  const errors: string[] = [];

  for (const path of paths) {
    const resolvedPath = resolve(path);
    let info: Deno.FileInfo;
    try {
      info = await Deno.stat(resolvedPath);
    } catch (error: unknown) {
      if (error instanceof Deno.errors.NotFound) {
        errors.push(`Path not found: ${path}`);
      } else {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`Cannot access ${path}: ${message}`);
      }
      continue;
    }

    if (info.isFile) {
      if (resolvedPath.endsWith(".sf.ts")) {
        files.add(resolvedPath);
      } else {
        errors.push(`Not a scenario file (expected *.sf.ts): ${path}`);
      }
      continue;
    }

    if (info.isDirectory) {
      try {
        for await (
          const entry of walk(resolvedPath, {
            exts: [".sf.ts"],
            includeDirs: false,
          })
        ) {
          files.add(entry.path);
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`Error searching ${path}: ${message}`);
      }
      continue;
    }

    errors.push(`Not a file or directory: ${path}`);
  }

  return { files: [...files].sort(), errors };
}

/**
 * Executes a scenario file with `deno run --allow-net --allow-env`.
 * When `capture` is true, stdout/stderr are buffered and returned instead
 * of being streamed to the terminal.
 */
async function executeScenarioFile(
  filePath: string,
  options: { capture: boolean; env: Record<string, string> },
): Promise<ScenarioResult> {
  const startTime = performance.now();
  try {
    const command = new Deno.Command("deno", {
      args: ["run", "--allow-net", "--allow-env", filePath],
      env: options.env,
      stdout: options.capture ? "piped" : "inherit",
      stderr: options.capture ? "piped" : "inherit",
    });

    const output = await command.output();
    const decoder = new TextDecoder();

    return {
      file: filePath,
      success: output.code === 0,
      durationMs: performance.now() - startTime,
      stdout: options.capture ? decoder.decode(output.stdout) : undefined,
      stderr: options.capture ? decoder.decode(output.stderr) : undefined,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      file: filePath,
      success: false,
      durationMs: performance.now() - startTime,
      stdout: options.capture ? "" : undefined,
      stderr: options.capture
        ? `Error executing ${filePath}: ${message}\n`
        : undefined,
    };
  }
}

/**
 * Prints a buffered result as one contiguous block.
 * Everything is written with a single synchronous call so that blocks of
 * concurrently finishing files can never interleave.
 */
function printBufferedResult(result: ScenarioResult): void {
  const status = result.success ? "✅ PASSED" : "❌ FAILED";
  const duration = `${Math.round(result.durationMs)}ms`;
  const header = `\n${
    "━".repeat(60)
  }\n${status}  ${result.file}  (${duration})\n${"━".repeat(60)}\n`;
  let body = result.stdout ?? "";
  if (result.stderr) {
    if (body.length > 0 && !body.endsWith("\n")) body += "\n";
    body += result.stderr;
  }
  if (body.length > 0 && !body.endsWith("\n")) body += "\n";
  Deno.stdout.writeSync(new TextEncoder().encode(header + body));
}

/**
 * Runs `worker` over `items` with at most `concurrency` in flight.
 * Results are reported through `onDone` as soon as each item finishes.
 */
async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
  onDone: (result: R) => void,
): Promise<R[]> {
  const results: R[] = [];
  let next = 0;

  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (next < items.length) {
        const item = items[next++];
        const result = await worker(item);
        results.push(result);
        onDone(result);
      }
    },
  );

  await Promise.all(runners);
  return results;
}

/**
 * Main function to run the CLI. Returns the process exit code.
 */
export async function main(args: string[] = Deno.args): Promise<number> {
  let options: CliOptions;
  try {
    options = parseCliArgs(args);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ ${message}`);
    return 1;
  }

  if (options.help) {
    printHelp();
    return 0;
  }

  console.log(`🔍 Searching for .sf.ts files in: ${options.paths.join(", ")}`);

  const { files: allFiles, errors } = await collectScenarioFiles(options.paths);
  for (const error of errors) {
    console.error(`❌ ${error}`);
  }

  const scenarioFiles = options.filter
    ? allFiles.filter(buildFilter(options.filter))
    : allFiles;

  if (options.filter) {
    console.log(
      `🔎 Filter "${options.filter}" matched ${scenarioFiles.length}/${allFiles.length} files`,
    );
  }

  if (scenarioFiles.length === 0) {
    console.log("❌ No .sf.ts files found.");
    if (errors.length > 0) return 1;
    return options.allowEmpty ? 0 : 1;
  }

  console.log(`✅ Found ${scenarioFiles.length} .sf.ts files:`);
  scenarioFiles.forEach((file) => console.log(`  📄 ${file}`));
  console.log("");

  const env: Record<string, string> = {};
  if (options.baseUrl) {
    env.SF_API_BASE_URL = options.baseUrl;
    console.log(`🌐 Base URL override: ${options.baseUrl}`);
  }

  const concurrent = options.concurrency > 1;
  if (concurrent) {
    console.log(`⚡ Running with concurrency: ${options.concurrency}`);
  }

  const startTime = performance.now();

  const results = await runWithConcurrency(
    scenarioFiles,
    options.concurrency,
    (file) => {
      if (!concurrent) console.log(`▶ Running: ${file}`);
      return executeScenarioFile(file, { capture: concurrent, env });
    },
    (result) => {
      if (concurrent) printBufferedResult(result);
    },
  );

  const totalDuration = performance.now() - startTime;
  const successCount = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success);

  logger.logExecutionSummary(scenarioFiles.length, successCount, totalDuration);

  if (failed.length > 0) {
    console.log("\nFailed files:");
    failed.forEach((r) => console.log(`  ❌ ${r.file}`));
  }

  return failed.length === 0 && errors.length === 0 ? 0 : 1;
}

// Run the main function if this module is executed directly
if (import.meta.main) {
  Deno.exit(await main());
}
