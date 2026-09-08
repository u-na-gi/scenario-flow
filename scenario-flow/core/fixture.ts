import type { ContextRecord } from "./context.ts";
import { readEnvVar } from "./config.ts";
import { logger } from "./logger.ts";

/**
 * Environment variable naming a JSON file whose top-level object is loaded
 * into the initial context of every top-level `ScenarioFlow` constructed in
 * the process (see `sfcli --setup`).
 */
export const CONTEXT_FILE_ENV_KEY = "SF_CONTEXT_FILE";

/**
 * Environment variable naming a file to which the context of every
 * successfully executed `ScenarioFlow` is written as JSON. Only
 * JSON-serializable values are kept (see {@link toSerializableContext}).
 */
export const CONTEXT_OUT_ENV_KEY = "SF_CONTEXT_OUT";

/** Parsed fixture files, keyed by path (`null` = unreadable, already warned). */
const loadedFixtures = new Map<string, ContextRecord | null>();

/** Messages already printed once per process. */
const warnedOnce = new Set<string>();

/**
 * Context values accumulated across all scenarios executed in this process.
 * The whole record is written on every successful `execute()` when
 * `SF_CONTEXT_OUT` is set, so a setup file that executes several scenarios
 * ends up with the union of their contexts (later scenarios win on
 * conflicting keys).
 */
let accumulatedOut: ContextRecord = {};

function warnOnce(message: string): void {
  if (warnedOnce.has(message)) return;
  warnedOnce.add(message);
  logger.logWarn(message);
}

/**
 * Query a file-system permission without prompting or throwing.
 * Returns `true` when the permission is granted for `path`.
 */
function hasFsPermission(name: "read" | "write", path: string): boolean {
  try {
    const status = Deno.permissions?.querySync?.({ name, path });
    return status === undefined || status.state === "granted";
  } catch {
    return false;
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Whether a value survives {@link toSerializableContext}: JSON primitives,
 * arrays, plain objects and objects with their own `toJSON` (e.g. `Date`).
 * Functions, symbols, bigints, `undefined` and class instances such as
 * `Response`, `Map` or `Set` do not.
 *
 * @param value - Any context value
 * @returns `true` when the value is kept by {@link toSerializableContext}
 */
export function isSerializableContextValue(value: unknown): boolean {
  switch (typeof value) {
    case "string":
    case "number":
    case "boolean":
      return true;
    case "object":
      return value === null || Array.isArray(value) || isPlainObject(value) ||
        typeof (value as { toJSON?: unknown }).toJSON === "function";
    default:
      return false;
  }
}

/**
 * Serialize a context record to JSON, dropping every value that is not
 * JSON-serializable (functions, symbols, bigints, `Response` objects, ...).
 * Non-serializable values nested in objects are dropped as well; inside
 * arrays they become `null`, as `JSON.stringify` does for `undefined`.
 *
 * @param record - Context values (`ctx.customContext`)
 * @returns JSON text of the serializable subset
 * @throws When the record cannot be stringified at all (e.g. a circular
 *   reference)
 */
export function toSerializableContext(record: ContextRecord): string {
  return JSON.stringify(
    record,
    (_key, value) => isSerializableContextValue(value) ? value : undefined,
  );
}

/**
 * Load the context fixture named by `SF_CONTEXT_FILE`, if any.
 *
 * The file is read once per process and path. When the variable is unset or
 * the environment cannot be read (no `--allow-env`), `undefined` is returned
 * silently. When the file cannot be used (no `--allow-read=<path>`, missing,
 * invalid JSON, not an object) a warning is logged once and `undefined` is
 * returned; nothing is ever thrown.
 *
 * @returns A shallow copy of the fixture object, or `undefined`
 */
export function loadContextFixture(): ContextRecord | undefined {
  const path = readEnvVar(CONTEXT_FILE_ENV_KEY);
  if (path === undefined) return undefined;

  const cached = loadedFixtures.get(path);
  if (cached !== undefined) {
    return cached === null ? undefined : { ...cached };
  }

  let parsed: ContextRecord | null = null;
  if (!hasFsPermission("read", path)) {
    warnOnce(
      `${CONTEXT_FILE_ENV_KEY}=${path} ignored: read permission is missing ` +
        `(run with --allow-read=${path})`,
    );
  } else {
    try {
      const value: unknown = JSON.parse(Deno.readTextFileSync(path));
      if (isPlainObject(value)) {
        parsed = value;
      } else {
        warnOnce(
          `${CONTEXT_FILE_ENV_KEY}=${path} ignored: expected a JSON object at the top level`,
        );
      }
    } catch (error) {
      warnOnce(`${CONTEXT_FILE_ENV_KEY}=${path} ignored: ${error}`);
    }
  }

  loadedFixtures.set(path, parsed);
  return parsed === null ? undefined : { ...parsed };
}

/**
 * Write the context of a successfully executed scenario to the file named by
 * `SF_CONTEXT_OUT`, if any. Values from earlier scenarios executed in the
 * same process are kept (later scenarios win on conflicting keys). Only
 * JSON-serializable values are written; see {@link toSerializableContext}.
 *
 * When the variable is unset or the environment cannot be read, nothing
 * happens. When the file cannot be written (no `--allow-write=<path>`, or
 * the context cannot be serialized) a warning is logged once and nothing is
 * thrown.
 *
 * @param record - Context values (`ctx.customContext`)
 */
export function writeContextOut(record: ContextRecord): void {
  const path = readEnvVar(CONTEXT_OUT_ENV_KEY);
  if (path === undefined) return;

  if (!hasFsPermission("write", path)) {
    warnOnce(
      `${CONTEXT_OUT_ENV_KEY}=${path} ignored: write permission is missing ` +
        `(run with --allow-write=${path})`,
    );
    return;
  }

  try {
    const serializable = JSON.parse(toSerializableContext(record));
    accumulatedOut = { ...accumulatedOut, ...serializable };
    Deno.writeTextFileSync(
      path,
      JSON.stringify(accumulatedOut, null, 2) + "\n",
    );
    logger.logInfo(`Context written to ${CONTEXT_OUT_ENV_KEY}: ${path}`);
  } catch (error) {
    warnOnce(
      `${CONTEXT_OUT_ENV_KEY}=${path}: could not write context: ${error}`,
    );
  }
}

/**
 * Forget cached fixture files, printed warnings and accumulated output
 * values. Intended for tests.
 */
export function resetContextFixtureState(): void {
  loadedFixtures.clear();
  warnedOnce.clear();
  accumulatedOut = {};
}
