import { assertEquals } from "@std/assert";

Deno.test("CLI help functionality", async () => {
  const process = new Deno.Command("deno", {
    args: ["run", "--allow-read", "--allow-run", "main.ts", "-h"],
    cwd: Deno.cwd(),
    stdout: "piped",
    stderr: "piped",
  });

  const { code, stdout } = await process.output();
  const output = new TextDecoder().decode(stdout);

  assertEquals(code, 0);
  assertEquals(output.includes("scenario-flow-cli (sfcli)"), true);
  assertEquals(output.includes("USAGE:"), true);
  assertEquals(output.includes("OPTIONS:"), true);
});

Deno.test("CLI finds .sf.ts files", async () => {
  const process = new Deno.Command("deno", {
    args: [
      "run",
      "--allow-read",
      "--allow-run",
      "--allow-net",
      "main.ts",
      "../example",
    ],
    cwd: Deno.cwd(),
    stdout: "piped",
    stderr: "piped",
  });

  const { code, stdout } = await process.output();
  const output = new TextDecoder().decode(stdout);

  assertEquals(code, 0);
  assertEquals(output.includes("Found 3 .sf.ts files:"), true);
  assertEquals(output.includes("login.sf.ts"), true);
  assertEquals(output.includes("get-data.sf.ts"), true);
  assertEquals(output.includes("search-with-query.sf.ts"), true);
  // Check for improved logging output
  assertEquals(output.includes("🔍 Searching for"), true);
  assertEquals(output.includes("📄"), true);
});
