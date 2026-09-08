import {
  assertEquals,
  assertInstanceOf,
  AssertionError,
  assertMatch,
  assertRejects,
  assertStringIncludes,
  assertThrows,
} from "@std/assert";
import { assert, ScenarioAssertionError } from "../assert.ts";
import { createCtx } from "../context.ts";
import { ScenarioFlow } from "../index.ts";

const config = { apiBaseUrl: "https://api.example.com" };

/** Run `fn` and return the thrown ScenarioAssertionError. */
function capture(fn: () => void): ScenarioAssertionError {
  return assertThrows(fn, ScenarioAssertionError);
}

/** Capture everything written via console.log while `fn` runs. */
async function captureLog(fn: () => Promise<void>): Promise<string> {
  const original = console.log;
  const lines: string[] = [];
  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  try {
    await fn();
  } finally {
    console.log = original;
  }
  // deno-lint-ignore no-control-regex
  return lines.join("\n").replace(/\x1b\[[0-9;]*m/g, "");
}

Deno.test("assert.equal - passes on deep-equal values", () => {
  assert.equal({ a: [1, 2] }, { a: [1, 2] });
  assert.equal("x", "x", "with message");
});

Deno.test("assert.equal - throws ScenarioAssertionError with expected/actual", () => {
  const err = capture(() => assert.equal(["abc", "def"], ["abc"], "save tag"));
  assertEquals(err.name, "ScenarioAssertionError");
  assertEquals(err.assertionMessage, "save tag");
  assertEquals(err.expected, ["abc"]);
  assertEquals(err.actual, ["abc", "def"]);
  assertStringIncludes(err.message, "save tag");
  assertStringIncludes(err.message, 'expected: [ "abc" ]');
  assertStringIncludes(err.message, 'actual:   [ "abc", "def" ]');
  // underlying @std/assert error is preserved
  assertInstanceOf(err.cause, AssertionError);
  assertEquals(err.detail, (err.cause as Error).message);
});

Deno.test("assert.equal - default message and call-site location", () => {
  const err = capture(() => assert.equal(1, 2));
  assertEquals(err.assertionMessage, "assert.equal failed");
  assertMatch(err.location ?? "", /assert\.test\.ts:\d+:\d+$/);
  assertStringIncludes(err.message, `(at ${err.location})`);
});

Deno.test("assert.deepEqual - is an alias of equal", () => {
  assertEquals(assert.deepEqual, assert.equal);
  assert.deepEqual([1, { b: 2 }], [1, { b: 2 }]);
  const err = capture(() => assert.deepEqual({ a: 1 }, { a: 2 }));
  assertEquals(err.expected, { a: 2 });
  assertEquals(err.actual, { a: 1 });
});

Deno.test("assert.strictEqual - passes/fails on ===", () => {
  const obj = { a: 1 };
  assert.strictEqual(obj, obj);
  assert.strictEqual(1, 1);
  const err = capture(() => assert.strictEqual({ a: 1 }, { a: 1 }));
  assertEquals(err.expected, { a: 1 });
  assertEquals(err.actual, { a: 1 });
  assertEquals(err.assertionMessage, "assert.strictEqual failed");
});

Deno.test("assert.notEqual - passes on different, fails on equal", () => {
  assert.notEqual(1, 2);
  assert.notEqual({ a: 1 }, { a: 2 });
  const err = capture(() => assert.notEqual([1], [1], "must differ"));
  assertEquals(err.assertionMessage, "must differ");
  assertEquals(err.expected, "anything but [ 1 ]");
  assertEquals(err.actual, [1]);
});

Deno.test("assert.ok - passes on truthy, fails on falsy", () => {
  assert.ok(true);
  assert.ok("non-empty");
  assert.ok(1);
  const err = capture(() => assert.ok(0, "zero is falsy"));
  assertEquals(err.assertionMessage, "zero is falsy");
  assertEquals(err.expected, true);
  assertEquals(err.actual, 0);
  capture(() => assert.ok(""));
  capture(() => assert.ok(null));
});

Deno.test("assert.exists - passes on defined, fails on null/undefined", () => {
  assert.exists(0);
  assert.exists("");
  assert.exists(false);
  const err = capture(() => assert.exists(undefined, "token missing"));
  assertEquals(err.assertionMessage, "token missing");
  assertEquals(err.expected, "not null or undefined");
  assertEquals(err.actual, undefined);
  const err2 = capture(() => assert.exists(null));
  assertEquals(err2.actual, null);
});

Deno.test("assert.match - passes on match, fails otherwise", () => {
  assert.match("hello world", /wor/);
  const err = capture(() => assert.match("hello", /^bye/, "greeting"));
  assertEquals(err.assertionMessage, "greeting");
  assertEquals(err.expected, /^bye/);
  assertEquals(err.actual, "hello");
});

Deno.test("assert.objectMatch - passes on subset, fails otherwise", () => {
  assert.objectMatch({ a: 1, b: { c: 2, d: 3 } }, { b: { c: 2 } });
  const err = capture(() => assert.objectMatch({ a: 1 }, { a: 2 }));
  assertEquals(err.expected, { a: 2 });
  assertEquals(err.actual, { a: 1 });
});

Deno.test("assert.status - single expected status", () => {
  assert.status(new Response(null, { status: 200 }), 200);
  const err = capture(() =>
    assert.status(new Response(null, { status: 401 }), 200)
  );
  assertEquals(err.expected, 200);
  assertEquals(err.actual, 401);
  assertStringIncludes(err.assertionMessage, "expected 200 but got 401");
});

Deno.test("assert.status - array of expected statuses", () => {
  assert.status(new Response(null, { status: 201 }), [200, 201]);
  const err = capture(() =>
    assert.status(new Response(null, { status: 404 }), [200, 201], "create")
  );
  assertEquals(err.assertionMessage, "create");
  assertEquals(err.expected, [200, 201]);
  assertEquals(err.actual, 404);
});

Deno.test("assert.fail - always throws", () => {
  const err = capture(() => assert.fail("unreachable"));
  assertEquals(err.assertionMessage, "unreachable");
  assertEquals(err.expected, undefined);
  assertEquals(err.actual, undefined);
  assertEquals(
    capture(() => assert.fail()).assertionMessage,
    "assert.fail called",
  );
});

Deno.test("assert - long values are truncated in the error message", () => {
  const big = "x".repeat(2000);
  const err = capture(() => assert.equal(big, "y"));
  assertEquals(err.actual, big); // raw value preserved
  assertStringIncludes(err.message, "...");
  assertEquals(err.message.length < 1000, true);
});

Deno.test("createCtx - context exposes assert", () => {
  const ctx = createCtx(() => Promise.resolve(new Response()), config);
  assertEquals(ctx.assert, assert);
  ctx.assert.equal(1, 1);
  capture(() => ctx.assert.equal(1, 2));
});

Deno.test("ScenarioFlow - ctx.assert failure is logged with expected/actual and rejects", async () => {
  const flow = new ScenarioFlow("assert-scenario", config);
  flow.step("save tag filter", async (ctx) => {
    await Promise.resolve();
    ctx.assert.deepEqual(["abc", "def"], ["abc"], "save tag filter");
  });

  let thrown: unknown;
  const output = await captureLog(async () => {
    thrown = await assertRejects(() => flow.execute(), ScenarioAssertionError);
  });

  assertInstanceOf(thrown, ScenarioAssertionError);
  assertEquals(thrown.expected, ["abc"]);
  assertEquals(thrown.actual, ["abc", "def"]);

  assertStringIncludes(output, "📋 STEP: save tag filter");
  assertStringIncludes(output, "ASSERTION FAILED: save tag filter");
  assertMatch(output, /\(at .*assert\.test\.ts:\d+:\d+\)/);
  assertStringIncludes(output, 'expected: [ "abc" ]');
  assertStringIncludes(output, 'actual:   [ "abc", "def" ]');
  assertStringIncludes(output, "SCENARIO FAILED");
  // The generic step error line is replaced by the assertion block
  assertEquals(output.includes('Error in step "save tag filter"'), false);
});

Deno.test("ScenarioFlow - raw @std/assert failure is logged as assertion failure", async () => {
  const flow = new ScenarioFlow("raw-assert-scenario", config);
  flow.step("compare", async () => {
    await Promise.resolve();
    assertEquals(1, 2, "one is not two");
  });

  const output = await captureLog(async () => {
    await assertRejects(() => flow.execute(), AssertionError);
  });

  assertStringIncludes(output, "ASSERTION FAILED: ");
  assertStringIncludes(output, "one is not two");
  // expected/actual are unknown for a raw AssertionError
  assertEquals(output.includes("expected: "), false);
  assertEquals(output.includes("actual:   "), false);
  assertEquals(output.includes('Error in step "compare"'), false);
});

Deno.test("ScenarioFlow - non-assertion errors keep the generic error log", async () => {
  const flow = new ScenarioFlow("plain-error", config);
  flow.step("boom", async () => {
    await Promise.resolve();
    throw new Error("boom!");
  });

  const output = await captureLog(async () => {
    await assertRejects(() => flow.execute(), Error, "boom!");
  });

  assertStringIncludes(output, 'Error in step "boom": Error: boom!');
  assertEquals(output.includes("ASSERTION FAILED"), false);
});
