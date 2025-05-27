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

### Basic Commands

```bash
# Show help
sfcli -h
sfcli --help

# Run all .sf.ts files in current directory
sfcli .

# Run all .sf.ts files in specified directory
sfcli ./path/to/scenarios
```

### Examples

```bash
# Find and execute all .sf.ts files in the current directory
sfcli .

# Find and execute all .sf.ts files in the example directory
sfcli ../example

# Show help information
sfcli -h
```

## What it does

The CLI tool:

1. **Searches recursively** for all files with the `.sf.ts` extension in the
   specified directory
2. **Executes each file** using `deno run --allow-net <file>`
3. **Reports results** showing which files were executed successfully
4. **Provides summary** of execution results

## Features

- ✅ Recursive directory scanning
- ✅ Automatic network permission (`--allow-net`)
- ✅ Clear execution feedback
- ✅ Error handling and reporting
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
