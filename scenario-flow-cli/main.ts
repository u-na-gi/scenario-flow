#!/usr/bin/env -S deno run --allow-read --allow-run

import { resolve } from "https://deno.land/std@0.204.0/path/mod.ts";
import { walk } from "https://deno.land/std@0.204.0/fs/walk.ts";

/**
 * Prints the help message for the CLI
 */
function printHelp(): void {
  console.log(`
scenario-flow-cli (sfcli)

USAGE:
  sfcli [OPTIONS] [DIRECTORY]

OPTIONS:
  -h, --help    Show this help message

ARGUMENTS:
  DIRECTORY     Directory to search for .sf.ts files (default: current directory)

DESCRIPTION:
  Finds all .sf.ts files in the specified directory and its subdirectories,
  and executes them with 'deno run --allow-net'.
  
EXAMPLES:
  sfcli .                   # Run all .sf.ts files in current directory
  sfcli ./path/to/scenarios # Run all .sf.ts files in specified directory
`);
}

/**
 * Finds all .sf.ts files in the specified directory and its subdirectories
 */
async function findScenarioFiles(directory: string): Promise<string[]> {
  const scenarioFiles: string[] = [];

  try {
    const resolvedPath = resolve(directory);

    for await (
      const entry of walk(resolvedPath, {
        exts: [".sf.ts"],
        includeDirs: false,
      })
    ) {
      scenarioFiles.push(entry.path);
    }

    return scenarioFiles;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error searching for .sf.ts files: ${errorMessage}`);
    return [];
  }
}

/**
 * Executes a scenario file with deno run --allow-net
 */
async function executeScenarioFile(filePath: string): Promise<boolean> {
  try {
    console.log(`Executing: ${filePath}`);

    const process = new Deno.Command("deno", {
      args: ["run", "-A", filePath],
      stdout: "inherit",
      stderr: "inherit",
    });

    const { code } = await process.output();

    if (code === 0) {
      console.log(`Successfully executed: ${filePath}`);
      return true;
    } else {
      console.error(`Failed to execute: ${filePath} (exit code: ${code})`);
      return false;
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error executing ${filePath}: ${errorMessage}`);
    return false;
  }
}

/**
 * Main function to run the CLI
 */
async function main(): Promise<void> {
  const args = Deno.args;

  // Handle help flag
  if (args.includes("-h") || args.includes("--help")) {
    printHelp();
    return;
  }

  // Determine the directory to search
  const directory = args.length > 0 && !args[0].startsWith("-") ? args[0] : ".";

  console.log(`Searching for .sf.ts files in: ${directory}`);

  // Find all scenario files
  const scenarioFiles = await findScenarioFiles(directory);

  if (scenarioFiles.length === 0) {
    console.log("No .sf.ts files found.");
    return;
  }

  console.log(`Found ${scenarioFiles.length} .sf.ts files:`);
  scenarioFiles.forEach((file) => console.log(`- ${file}`));

  // Execute each scenario file
  let successCount = 0;

  for (const file of scenarioFiles) {
    const success = await executeScenarioFile(file);
    if (success) {
      successCount++;
    }
  }

  console.log(
    `\nExecution summary: ${successCount}/${scenarioFiles.length} files executed successfully.`,
  );
}

// Run the main function if this module is executed directly
if (import.meta.main) {
  await main();
}
