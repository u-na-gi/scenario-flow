import { assert, assertEquals, assertNotEquals } from "@std/assert";
import { join, resolve } from "@std/path";
import {
  buildFilter,
  collectScenarioFiles,
  filterScenarioFiles,
  parseCliArgs,
} from "./main.ts";

// Self-contained fixtures (no network, no library import needed).
// See test_fixtures/ for their contents.
const FIXTURES = "test_fixtures";
const BASIC = join(FIXTURES, "basic");
const EMPTY = join(FIXTURES, "empty");
const CONCURRENT = join(FIXTURES, "concurrent");
const ENV = join(FIXTURES, "env");

interface CliRun {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Runs the CLI (main.ts) as a subprocess and returns exit code and output.
 */
async function runCli(
  args: string[],
  env: Record<string, string> = {},
): Promise<CliRun> {
  const process = new Deno.Command("deno", {
    args: ["run", "--allow-read", "--allow-run", "main.ts", ...args],
    cwd: Deno.cwd(),
    env,
    stdout: "piped",
    stderr: "piped",
  });

  const { code, stdout, stderr } = await process.output();
  const decoder = new TextDecoder();
  return {
    code,
    stdout: decoder.decode(stdout),
    stderr: decoder.decode(stderr),
  };
}

Deno.test("CLI help functionality", async () => {
  const { code, stdout } = await runCli(["-h"]);

  assertEquals(code, 0);
  assertEquals(stdout.includes("scenario-flow-cli (sfcli)"), true);
  assertEquals(stdout.includes("USAGE:"), true);
  assertEquals(stdout.includes("OPTIONS:"), true);
  assertEquals(stdout.includes("--concurrency"), true);
  assertEquals(stdout.includes("--filter"), true);
  assertEquals(stdout.includes("--base-url"), true);
  assertEquals(stdout.includes("--allow-empty"), true);
});

Deno.test("CLI finds .sf.ts files", async () => {
  // The example scenarios need a server on localhost:3323, so the exit
  // code depends on the environment; only the discovery output is checked.
  const { stdout } = await runCli(["../example"]);

  assertEquals(stdout.includes("Found 3 .sf.ts files:"), true);
  assertEquals(stdout.includes("login.sf.ts"), true);
  assertEquals(stdout.includes("get-data.sf.ts"), true);
  assertEquals(stdout.includes("search-with-query.sf.ts"), true);
  // Check for improved logging output
  assertEquals(stdout.includes("🔍 Searching for"), true);
  assertEquals(stdout.includes("📄"), true);
});

Deno.test("CLI exits 0 when all scenarios pass", async () => {
  const { code, stdout } = await runCli([join(BASIC, "pass.sf.ts")]);
  assertEquals(code, 0);
  assertEquals(stdout.includes("pass-scenario-ran"), true);
  assertEquals(stdout.includes("1/1 scenarios executed successfully"), true);
});

Deno.test("CLI exits non-zero when a scenario fails", async () => {
  const { code, stdout } = await runCli([BASIC]);
  assertEquals(code, 1);
  assertEquals(stdout.includes("Found 2 .sf.ts files:"), true);
  assertEquals(stdout.includes("1/2 scenarios executed successfully"), true);
  assertEquals(stdout.includes("Failed files:"), true);
  assertEquals(stdout.includes("fail.sf.ts"), true);
  // The plain .ts file must never be picked up
  assertEquals(stdout.includes("should never run"), false);
});

Deno.test("CLI exits non-zero when no .sf.ts files are found", async () => {
  const { code, stdout } = await runCli([EMPTY]);
  assertEquals(code, 1);
  assertEquals(stdout.includes("No .sf.ts files found."), true);
});

Deno.test("CLI --allow-empty exits 0 when no .sf.ts files are found", async () => {
  const { code, stdout } = await runCli(["--allow-empty", EMPTY]);
  assertEquals(code, 0);
  assertEquals(stdout.includes("No .sf.ts files found."), true);
});

Deno.test("CLI accepts a single file argument", async () => {
  const { code, stdout } = await runCli([join(BASIC, "nested", "fail.sf.ts")]);
  assertEquals(code, 1);
  assertEquals(stdout.includes("Found 1 .sf.ts files:"), true);
  assertEquals(stdout.includes("fail-scenario-ran"), true);
  assertEquals(stdout.includes("pass-scenario-ran"), false);
});

Deno.test("CLI accepts multiple paths and de-duplicates them", async () => {
  const file = join(BASIC, "pass.sf.ts");
  // BASIC already contains pass.sf.ts; passing it again must not duplicate
  const { stdout } = await runCli([file, BASIC, file]);
  assertEquals(stdout.includes("Found 2 .sf.ts files:"), true);
  assertEquals(stdout.split("pass-scenario-ran").length - 1, 1);
});

Deno.test("CLI rejects a nonexistent path with a clear error", async () => {
  const { code, stderr } = await runCli([join(BASIC, "does-not-exist")]);
  assertEquals(code, 1);
  assertEquals(stderr.includes("Path not found"), true);
  assertEquals(stderr.includes("does-not-exist"), true);
});

Deno.test("CLI rejects a file that is not a .sf.ts file", async () => {
  const { code, stderr, stdout } = await runCli([
    join(BASIC, "not-a-scenario.ts"),
  ]);
  assertEquals(code, 1);
  assertEquals(stderr.includes("Not a scenario file"), true);
  assertEquals(stdout.includes("should never run"), false);
});

Deno.test("CLI --filter selects files by substring", async () => {
  const { code, stdout } = await runCli(["--filter", "pass", BASIC]);
  assertEquals(code, 0);
  assertEquals(stdout.includes("Found 1 .sf.ts files:"), true);
  assertEquals(stdout.includes("pass-scenario-ran"), true);
  assertEquals(stdout.includes("fail-scenario-ran"), false);
});

Deno.test("CLI --filter matches the path relative to cwd only", async () => {
  // cwd is .../scenario-flow-cli; that directory name must not match
  const { code, stdout } = await runCli([
    "--filter",
    "scenario-flow-cli",
    "--allow-empty",
    BASIC,
  ]);
  assertEquals(code, 0);
  assertEquals(stdout.includes("matched 0/2 files"), true);
  assertEquals(stdout.includes("No .sf.ts files found."), true);
});

Deno.test("CLI --filter supports /regex/ patterns", async () => {
  const { code, stdout } = await runCli(["--filter", "/nested.fail/", BASIC]);
  assertEquals(code, 1);
  assertEquals(stdout.includes("Found 1 .sf.ts files:"), true);
  assertEquals(stdout.includes("fail-scenario-ran"), true);
  assertEquals(stdout.includes("pass-scenario-ran"), false);
});

Deno.test("CLI rejects invalid --concurrency values", async () => {
  for (const value of ["0", "abc", "1.5", ""]) {
    const { code, stderr } = await runCli(["-c", value, BASIC]);
    assertEquals(code, 1, `concurrency=${value}`);
    assertEquals(
      stderr.includes("--concurrency"),
      true,
      `concurrency=${value}`,
    );
  }
  // A negative number is parsed as an unknown flag and rejected as well
  const negative = await runCli(["-c", "-1", BASIC]);
  assertEquals(negative.code, 1);
  assertEquals(negative.stderr.includes("-1"), true);
});

Deno.test("CLI rejects unknown options", async () => {
  const { code, stderr } = await runCli(["--bogus", "."]);
  assertEquals(code, 1);
  assertEquals(stderr.includes("--bogus"), true);
});

Deno.test("CLI --concurrency runs files in parallel without interleaving output", async () => {
  // a-slow starts first (sorted order) but finishes ~1.4s after b-fast;
  // with streaming output the lines would interleave as
  // slow-1, fast-1, fast-2, slow-2.
  const { code, stdout } = await runCli(["-c", "2", CONCURRENT]);
  assertEquals(code, 0);
  assertEquals(stdout.includes("Running with concurrency: 2"), true);
  assertEquals(stdout.includes("2/2 scenarios executed successfully"), true);

  const markers = stdout
    .split("\n")
    .filter((line) => /^(slow|fast)-[12]$/.test(line));
  assertEquals(markers.length, 4);
  // Each file's output must be a contiguous block.
  const joined = markers.join(",");
  assert(
    joined === "fast-1,fast-2,slow-1,slow-2" ||
      joined === "slow-1,slow-2,fast-1,fast-2",
    `output interleaved: ${joined}`,
  );
  // Both files get a status header
  assertEquals(stdout.includes("✅ PASSED"), true);
});

Deno.test("CLI --concurrency reports failures and stderr of failed files", async () => {
  const { code, stdout, stderr } = await runCli(["-c", "4", BASIC]);
  assertEquals(code, 1);
  // PASSED blocks go to stdout, FAILED blocks (with the child's stderr) to stderr
  assertEquals(stdout.includes("✅ PASSED"), true);
  assertEquals(stdout.includes("pass-scenario-ran"), true);
  assertEquals(stdout.includes("❌ FAILED"), false);
  assertEquals(stderr.includes("❌ FAILED"), true);
  assertEquals(stderr.includes("fail-scenario-ran"), true);
  assertEquals(stderr.includes("boom"), true);
  assertEquals(stdout.includes("1/2 scenarios executed successfully"), true);
});

Deno.test("CLI --base-url passes SF_API_BASE_URL to child processes", async () => {
  const viaFlag = await runCli([
    "--base-url",
    "http://flag.example:1234/",
    ENV,
  ]);
  assertEquals(viaFlag.code, 0);
  assertEquals(viaFlag.stdout.includes("Base URL override:"), true);
  assertEquals(
    viaFlag.stdout.includes("BASE_URL=http://flag.example:1234/"),
    true,
  );

  // Inherited environment variable keeps working without the flag
  const viaEnv = await runCli([ENV], {
    SF_API_BASE_URL: "http://env.example:5678/",
  });
  assertEquals(viaEnv.code, 0);
  assertEquals(
    viaEnv.stdout.includes("BASE_URL=http://env.example:5678/"),
    true,
  );

  // The flag takes precedence over the inherited variable
  const both = await runCli(["--base-url", "http://flag.example/", ENV], {
    SF_API_BASE_URL: "http://env.example/",
  });
  assertEquals(both.stdout.includes("BASE_URL=http://flag.example/"), true);
});

Deno.test("parseCliArgs parses options and defaults", () => {
  const defaults = parseCliArgs([]);
  assertEquals(defaults.paths, ["."]);
  assertEquals(defaults.concurrency, 1);
  assertEquals(defaults.allowEmpty, false);
  assertEquals(defaults.filter, undefined);
  assertEquals(defaults.baseUrl, undefined);
  assertEquals(defaults.help, false);

  const full = parseCliArgs([
    "-c",
    "3",
    "--filter",
    "login",
    "--base-url",
    "http://localhost:3000/",
    "--allow-empty",
    "a",
    "b/c.sf.ts",
  ]);
  assertEquals(full.paths, ["a", "b/c.sf.ts"]);
  assertEquals(full.concurrency, 3);
  assertEquals(full.filter, "login");
  assertEquals(full.baseUrl, "http://localhost:3000/");
  assertEquals(full.allowEmpty, true);

  assertEquals(parseCliArgs(["--concurrency=2"]).concurrency, 2);
  assertEquals(parseCliArgs(["-h"]).help, true);

  // Numeric-looking positionals must stay strings
  assertEquals(parseCliArgs(["1e3"]).paths, ["1e3"]);
  assertEquals(parseCliArgs(["007", "0x10"]).paths, ["007", "0x10"]);
});

Deno.test("buildFilter handles substring and regex patterns", () => {
  const substring = buildFilter("login");
  assertEquals(substring("/x/login.sf.ts"), true);
  assertEquals(substring("/x/logout.sf.ts"), false);

  const regex = buildFilter("/log(in|out)/");
  assertEquals(regex("/x/login.sf.ts"), true);
  assertEquals(regex("/x/logout.sf.ts"), true);
  assertEquals(regex("/x/search.sf.ts"), false);

  const caseInsensitive = buildFilter("/LOGIN/i");
  assertEquals(caseInsensitive("/x/login.sf.ts"), true);
});

Deno.test("filterScenarioFiles ignores directories above cwd", () => {
  const files = [
    "/home/me/scenario-test/a.sf.ts",
    "/home/me/scenario-test/test-login.sf.ts",
  ];
  assertEquals(filterScenarioFiles(files, "test", "/home/me/scenario-test"), [
    "/home/me/scenario-test/test-login.sf.ts",
  ]);
  assertEquals(
    filterScenarioFiles(files, "/^test-/", "/home/me/scenario-test"),
    ["/home/me/scenario-test/test-login.sf.ts"],
  );
});

Deno.test("collectScenarioFiles returns sorted, de-duplicated absolute paths", async () => {
  const { files, errors } = await collectScenarioFiles([
    join(BASIC, "pass.sf.ts"),
    BASIC,
    join(BASIC, "nested"),
    join(BASIC, "missing"),
    join(BASIC, "not-a-scenario.ts"),
  ]);
  assertEquals(files, [
    resolve(BASIC, "nested", "fail.sf.ts"),
    resolve(BASIC, "pass.sf.ts"),
  ]);
  assertEquals(errors.length, 2);
  assertNotEquals(errors.find((e) => e.includes("Path not found")), undefined);
  assertNotEquals(
    errors.find((e) => e.includes("Not a scenario file")),
    undefined,
  );
});
