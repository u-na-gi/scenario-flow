import {
  assert as stdAssert,
  assertEquals,
  assertExists,
  AssertionError,
  assertMatch,
  assertNotEquals,
  assertObjectMatch,
  assertStrictEquals,
} from "@std/assert";

/** Maximum length of a formatted expected/actual value before truncation. */
const MAX_VALUE_LENGTH = 500;

/**
 * Format a value for expected/actual display.
 * Uses `Deno.inspect` (falls back to `JSON.stringify` / `String`) and
 * truncates values longer than ~500 characters.
 * @internal
 */
export function formatAssertValue(value: unknown): string {
  let text: string;
  try {
    text = Deno.inspect(value, { depth: 4, colors: false, compact: true });
  } catch {
    try {
      text = JSON.stringify(value) ?? String(value);
    } catch {
      text = String(value);
    }
  }
  if (text.length > MAX_VALUE_LENGTH) {
    text = text.substring(0, MAX_VALUE_LENGTH) + "...";
  }
  return text;
}

/**
 * Error thrown by every `ScenarioAssert` helper on failure.
 * Carries the expected/actual values so the scenario logger can print them
 * inside the current STEP block.
 */
export class ScenarioAssertionError extends Error {
  override readonly name = "ScenarioAssertionError";
  /** The expected value (as passed to the helper). */
  readonly expected: unknown;
  /** The actual value (as passed to the helper). */
  readonly actual: unknown;
  /** The user-supplied (or default) assertion message, without decoration. */
  readonly assertionMessage: string;
  /** Call site as `./relative/path.ts:line:col`, when it could be determined. */
  readonly location?: string;
  /** Source line at the call site, when it could be read. */
  readonly source?: string;
  /** Message of the underlying `@std/assert` `AssertionError`, if any. */
  readonly detail?: string;

  constructor(
    assertionMessage: string,
    options: {
      expected?: unknown;
      actual?: unknown;
      location?: string;
      source?: string;
      detail?: string;
      cause?: unknown;
    } = {},
  ) {
    const lines = [
      assertionMessage + (options.location ? ` (at ${options.location})` : ""),
    ];
    if (options.source) {
      lines.push(`  ${options.source}`);
    }
    if (options.expected !== undefined || options.actual !== undefined) {
      lines.push(`  expected: ${formatAssertValue(options.expected)}`);
      lines.push(`  actual:   ${formatAssertValue(options.actual)}`);
    }
    super(lines.join("\n"), { cause: options.cause });
    this.assertionMessage = assertionMessage;
    this.expected = options.expected;
    this.actual = options.actual;
    this.location = options.location;
    this.source = options.source;
    this.detail = options.detail;
  }
}

/**
 * Returns true if `error` is a `ScenarioAssertionError` or an
 * `AssertionError` from `@std/assert` (or anything named like one).
 */
export function isAssertionError(error: unknown): boolean {
  if (error instanceof ScenarioAssertionError) return true;
  if (error instanceof AssertionError) return true;
  const name = (error as { name?: unknown } | null)?.name;
  return name === "AssertionError" || name === "ScenarioAssertionError";
}

// ---------------------------------------------------------------------------
// Call-site capture
// ---------------------------------------------------------------------------

interface CallSite {
  location: string;
  source?: string;
}

const SELF_URL = import.meta.url;
const FRAME_RE =
  /\(?((?:file|https?|jsr|npm|data|blob):[^\s()]+?):(\d+):(\d+)\)?$/;

function toDisplayPath(url: string): string {
  if (!url.startsWith("file://")) return url;
  let path: string;
  try {
    path = decodeURIComponent(new URL(url).pathname);
  } catch {
    return url;
  }
  try {
    const cwd = Deno.cwd().replace(/\\/g, "/");
    if (path.startsWith(cwd + "/")) {
      return "./" + path.substring(cwd.length + 1);
    }
  } catch {
    // no read permission: keep the absolute path
  }
  return path;
}

function readSourceLine(url: string, line: number): string | undefined {
  if (!url.startsWith("file://")) return undefined;
  try {
    const path = decodeURIComponent(new URL(url).pathname);
    const status = Deno.permissions.querySync({ name: "read", path });
    if (status.state !== "granted") return undefined;
    const text = Deno.readTextFileSync(path).split(/\r?\n/)[line - 1];
    const trimmed = text?.trim();
    return trimmed ? trimmed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Best-effort capture of the first stack frame outside this module and
 * `@std/assert`. Returns undefined if the stack cannot be parsed.
 */
function captureCallSite(): CallSite | undefined {
  try {
    const stack = new Error().stack;
    if (!stack) return undefined;
    for (const raw of stack.split("\n")) {
      const frame = raw.trim();
      if (!frame.startsWith("at ")) continue;
      const m = FRAME_RE.exec(frame);
      if (!m) continue;
      const [, url, line, col] = m;
      if (url === SELF_URL || url.includes("/@std/assert/")) continue;
      return {
        location: `${toDisplayPath(url)}:${line}:${col}`,
        source: readSourceLine(url, Number(line)),
      };
    }
  } catch {
    // ignore: location is optional
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// ScenarioAssert
// ---------------------------------------------------------------------------

/**
 * Assertion helpers available as `ctx.assert` inside a step (and as the
 * standalone `assert` export). Thin wrappers over `@std/assert` that throw
 * `ScenarioAssertionError` carrying expected/actual values so failures are
 * printed in a uniform format inside the step log.
 */
export interface ScenarioAssert {
  /** Deep equality (`assertEquals`). */
  equal<T>(actual: T, expected: T, msg?: string): void;
  /** Alias of `equal`. */
  deepEqual<T>(actual: T, expected: T, msg?: string): void;
  /** Strict (`===`) equality (`assertStrictEquals`). */
  strictEqual<T>(actual: T, expected: T, msg?: string): void;
  /** Deep inequality (`assertNotEquals`). */
  notEqual<T>(actual: T, expected: T, msg?: string): void;
  /** Asserts `value` is truthy (`assert`). */
  ok(value: unknown, msg?: string): asserts value;
  /** Asserts `value` is neither `null` nor `undefined` (`assertExists`). */
  exists<T>(value: T, msg?: string): asserts value is NonNullable<T>;
  /** Asserts `actual` matches `regex` (`assertMatch`). */
  match(actual: string, regex: RegExp, msg?: string): void;
  /** Asserts `actual` is a superset of `expected` (`assertObjectMatch`). */
  objectMatch(
    actual: Record<PropertyKey, unknown>,
    expected: Record<PropertyKey, unknown>,
    msg?: string,
  ): void;
  /** Asserts `res.status` equals `expected` (or is one of `expected`). */
  status(res: Response, expected: number | number[], msg?: string): void;
  /** Unconditionally fail. */
  fail(msg?: string): never;
}

/**
 * Run a `@std/assert` call and convert its `AssertionError` into a
 * `ScenarioAssertionError` with expected/actual and call-site info.
 */
function wrap(
  defaultMsg: string,
  msg: string | undefined,
  expected: unknown,
  actual: unknown,
  fn: () => void,
): void {
  try {
    fn();
  } catch (error) {
    if (!(error instanceof AssertionError)) throw error;
    const site = captureCallSite();
    throw new ScenarioAssertionError(msg ?? defaultMsg, {
      expected,
      actual,
      location: site?.location,
      source: site?.source,
      detail: error.message,
      cause: error,
    });
  }
}

/**
 * Create a `ScenarioAssert` instance.
 * @internal
 */
export function createScenarioAssert(): ScenarioAssert {
  const equal = <T>(actual: T, expected: T, msg?: string): void =>
    wrap("assert.equal failed", msg, expected, actual, () => {
      assertEquals(actual, expected);
    });

  return {
    equal,
    deepEqual: equal,

    strictEqual<T>(actual: T, expected: T, msg?: string): void {
      wrap("assert.strictEqual failed", msg, expected, actual, () => {
        assertStrictEquals(actual, expected);
      });
    },

    notEqual<T>(actual: T, expected: T, msg?: string): void {
      wrap(
        "assert.notEqual failed",
        msg,
        `anything but ${formatAssertValue(expected)}`,
        actual,
        () => {
          assertNotEquals(actual, expected);
        },
      );
    },

    ok(value: unknown, msg?: string): asserts value {
      wrap("assert.ok failed", msg, true, value, () => {
        stdAssert(value);
      });
    },

    exists<T>(value: T, msg?: string): asserts value is NonNullable<T> {
      wrap("assert.exists failed", msg, "not null or undefined", value, () => {
        assertExists(value);
      });
    },

    match(actual: string, regex: RegExp, msg?: string): void {
      wrap("assert.match failed", msg, regex, actual, () => {
        assertMatch(actual, regex);
      });
    },

    objectMatch(
      actual: Record<PropertyKey, unknown>,
      expected: Record<PropertyKey, unknown>,
      msg?: string,
    ): void {
      wrap("assert.objectMatch failed", msg, expected, actual, () => {
        assertObjectMatch(actual, expected);
      });
    },

    status(res: Response, expected: number | number[], msg?: string): void {
      const allowed = Array.isArray(expected) ? expected : [expected];
      wrap(
        `assert.status failed: expected ${
          allowed.join(" | ")
        } but got ${res.status} ${res.statusText}`.trimEnd(),
        msg,
        expected,
        res.status,
        () => {
          stdAssert(allowed.includes(res.status));
        },
      );
    },

    fail(msg?: string): never {
      const site = captureCallSite();
      throw new ScenarioAssertionError(msg ?? "assert.fail called", {
        location: site?.location,
        source: site?.source,
      });
    },
  };
}

/**
 * Standalone assertion helpers, identical to `ctx.assert`.
 * Useful in helper functions that do not receive the context.
 */
export const assert: ScenarioAssert = createScenarioAssert();
