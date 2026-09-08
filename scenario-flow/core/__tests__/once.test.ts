import { assertEquals, assertRejects } from "@std/assert";
import { ScenarioFlow } from "../index.ts";
import type { ScenarioFlowConfig } from "../type.ts";
import {
  CONTEXT_FILE_ENV_KEY,
  CONTEXT_OUT_ENV_KEY,
  isSerializableContextValue,
  resetContextFixtureState,
  toSerializableContext,
} from "../fixture.ts";

// Tests for issue #21: run a setup/parent chain only once.
//  - `parent.once()` memoizes the parent's run inside one process
//  - SF_CONTEXT_FILE / SF_CONTEXT_OUT carry a context across processes

const config: ScenarioFlowConfig = { apiBaseUrl: "https://api.example.com" };

/** Run `fn` with console.log captured; returns the captured lines. */
async function captureLog(fn: () => Promise<void>): Promise<string[]> {
  const originalLog = console.log;
  const lines: string[] = [];
  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  try {
    await fn();
  } finally {
    console.log = originalLog;
  }
  return lines;
}

type LoginCtx = { token: string; logins: number };

/** A run-once parent that counts how often its step actually ran. */
function createLogin(counter: { runs: number }) {
  return new ScenarioFlow<LoginCtx>("Login", config)
    .step("Authenticate", async (ctx) => {
      await Promise.resolve();
      counter.runs++;
      ctx.setContext("token", `token-${counter.runs}`);
      ctx.setContext("logins", counter.runs);
    })
    .once();
}

Deno.test("once - parent steps run once across two children, snapshot merged into the second", async () => {
  const counter = { runs: 0 };
  const login = createLogin(counter);

  const seen: Record<string, unknown> = {};
  const a = login.extend<{ a: boolean }>("A").step("a", async (ctx) => {
    await Promise.resolve();
    seen.aToken = ctx.getContext("token");
    ctx.setContext("a", true);
  });
  const b = login.extend<{ b: boolean }>("B").step("b", async (ctx) => {
    await Promise.resolve();
    seen.bToken = ctx.getContext("token");
    seen.bSawA = ctx.getContext("a" as never);
    ctx.setContext("b", true);
  });

  const lines = await captureLog(async () => {
    await a.execute();
    await b.execute();
  });

  assertEquals(counter.runs, 1);
  assertEquals(seen.aToken, "token-1");
  assertEquals(seen.bToken, "token-1");
  // Only what the parent's steps wrote is cached; A's own value is not.
  assertEquals(seen.bSawA, undefined);

  // The child shows one synthetic step; the second run reports the skip.
  assertEquals(
    lines.filter((l) => l.includes("STEP:") && l.includes("once: Login"))
      .length,
    2,
  );
  assertEquals(
    lines.filter((l) => l.includes('"Login" > Authenticate')).length,
    1,
  );
  assertEquals(
    lines.filter((l) => l.includes("(cached, skipped)")).length,
    1,
  );
});

Deno.test("once - without once() the parent still runs for every child", async () => {
  const counter = { runs: 0 };
  const login = new ScenarioFlow<LoginCtx>("Login", config)
    .step("Authenticate", async (ctx) => {
      await Promise.resolve();
      counter.runs++;
      ctx.setContext("token", "t");
    });

  await captureLog(async () => {
    await login.extend("A").execute();
    await login.extend("B").execute();
  });
  assertEquals(counter.runs, 2);
});

Deno.test("once - a failed run is not cached and the next child retries", async () => {
  let attempts = 0;
  const flaky = new ScenarioFlow<{ ok: boolean }>("Flaky", config)
    .step("maybe fail", async (ctx) => {
      await Promise.resolve();
      attempts++;
      if (attempts === 1) throw new Error("first attempt fails");
      ctx.setContext("ok", true);
    })
    .once();

  let okSeenByB: boolean | undefined;
  const a = flaky.extend("A");
  const b = flaky.extend("B").step("read", async (ctx) => {
    await Promise.resolve();
    okSeenByB = ctx.getContext("ok");
  });

  await captureLog(async () => {
    await assertRejects(() => a.execute(), Error, "first attempt fails");
    await b.execute();
  });

  assertEquals(attempts, 2);
  assertEquals(okSeenByB, true);
});

Deno.test("once - concurrent children share the in-flight run", async () => {
  let runs = 0;
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  const slow = new ScenarioFlow<{ value: string }>("Slow", config)
    .step("wait", async (ctx) => {
      runs++;
      await gate;
      ctx.setContext("value", "shared");
    })
    .once();

  const values: string[] = [];
  const children = ["A", "B", "C"].map((name) =>
    slow.extend(name).step("read", async (ctx) => {
      await Promise.resolve();
      values.push(ctx.getContext("value") ?? "missing");
    })
  );

  await captureLog(async () => {
    const all = Promise.all(children.map((c) => c.execute()));
    // Let every child reach the once step before the first run completes
    await new Promise((resolve) => setTimeout(resolve, 10));
    release();
    await all;
  });

  assertEquals(runs, 1);
  assertEquals(values, ["shared", "shared", "shared"]);
});

Deno.test("once - nested run-once chains compose", async () => {
  const counts = { register: 0, login: 0 };

  const register = new ScenarioFlow<{ userId: number }>("Register", config)
    .step("register", async (ctx) => {
      await Promise.resolve();
      counts.register++;
      ctx.setContext("userId", 42);
    })
    .once();

  const login = register.extend<{ token: string }>("Login")
    .step("login", async (ctx) => {
      await Promise.resolve();
      counts.login++;
      ctx.setContext("token", `token-for-${ctx.getContext("userId")}`);
    })
    .once();

  const seen: Array<[number | undefined, string | undefined]> = [];
  const children = ["A", "B"].map((name) =>
    login.extend(name).step("read", async (ctx) => {
      await Promise.resolve();
      seen.push([ctx.getContext("userId"), ctx.getContext("token")]);
    })
  );

  await captureLog(async () => {
    for (const child of children) await child.execute();
  });

  assertEquals(counts, { register: 1, login: 1 });
  assertEquals(seen, [[42, "token-for-42"], [42, "token-for-42"]]);
});

Deno.test("once - only the grandparent marked once: parent steps still run per child", async () => {
  const counts = { register: 0, login: 0 };

  const register = new ScenarioFlow<{ userId: number }>("Register", config)
    .step("register", async (ctx) => {
      await Promise.resolve();
      counts.register++;
      ctx.setContext("userId", 7);
    })
    .once();

  const login = register.extend<{ token: string }>("Login")
    .step("login", async (ctx) => {
      await Promise.resolve();
      counts.login++;
      ctx.setContext("token", `t${ctx.getContext("userId")}`);
    });

  await captureLog(async () => {
    await login.extend("A").execute();
    await login.extend("B").execute();
  });

  assertEquals(counts, { register: 1, login: 2 });
});

Deno.test("once - execute() on the parent itself populates the cache", async () => {
  const counter = { runs: 0 };
  const login = createLogin(counter);

  let token: string | undefined;
  const child = login.extend("Child").step("read", async (ctx) => {
    await Promise.resolve();
    token = ctx.getContext("token");
  });

  const lines = await captureLog(async () => {
    await login.execute();
    await child.execute();
    // A second direct execute() is also skipped
    await login.execute();
  });

  assertEquals(counter.runs, 1);
  assertEquals(token, "token-1");
  // Direct execution logs a regular step block, not the synthetic step
  assertEquals(
    lines.filter((l) => l.includes("STEP:") && l.includes("Authenticate"))
      .length,
    1,
  );
  assertEquals(
    lines.filter((l) => l.includes("(cached, skipped)")).length,
    2,
  );
});

Deno.test("once - step(parent) uses the synthetic step as well", async () => {
  const counter = { runs: 0 };
  const login = createLogin(counter);

  const tokens: Array<string | undefined> = [];
  const make = (name: string) =>
    new ScenarioFlow<{ own: number }>(name, config)
      .step(login)
      .step("read", async (ctx) => {
        await Promise.resolve();
        tokens.push(ctx.getContext("token"));
      });

  await captureLog(async () => {
    await make("A").execute();
    await make("B").execute();
  });

  assertEquals(counter.runs, 1);
  assertEquals(tokens, ["token-1", "token-1"]);
});

// ---------------------------------------------------------------------------
// SF_CONTEXT_FILE / SF_CONTEXT_OUT

Deno.test("toSerializableContext - keeps JSON values and drops the rest", () => {
  const json = toSerializableContext({
    token: "abc",
    id: 1,
    flag: false,
    nothing: null,
    list: [1, "two", () => 3],
    nested: { keep: "yes", drop: new Map() },
    when: new Date(0),
    fn: () => 1,
    response: new Response("x"),
    big: 10n,
    sym: Symbol("s"),
    undef: undefined,
  });
  assertEquals(JSON.parse(json), {
    token: "abc",
    id: 1,
    flag: false,
    nothing: null,
    list: [1, "two", null],
    nested: { keep: "yes" },
    when: "1970-01-01T00:00:00.000Z",
  });

  assertEquals(isSerializableContextValue("x"), true);
  assertEquals(isSerializableContextValue({ a: 1 }), true);
  assertEquals(isSerializableContextValue(new Response("x")), false);
  assertEquals(isSerializableContextValue(() => 1), false);
});

// Deno.test permissions can only narrow the parent's permissions, so the
// env/file-dependent tests are skipped without --allow-env/--allow-read/
// --allow-write.
const hasFixturePermissions = [CONTEXT_FILE_ENV_KEY, CONTEXT_OUT_ENV_KEY]
  .every((variable) =>
    Deno.permissions.querySync({ name: "env", variable }).state === "granted"
  ) &&
  Deno.permissions.querySync({ name: "read" }).state === "granted" &&
  Deno.permissions.querySync({ name: "write" }).state === "granted";
const fixtureTestOptions = {
  permissions: {
    env: [CONTEXT_FILE_ENV_KEY, CONTEXT_OUT_ENV_KEY],
    read: true,
    write: true,
  },
  ignore: !hasFixturePermissions,
};

/** Run `fn` with the given env vars set, restoring them afterwards. */
async function withEnv(
  vars: Record<string, string | undefined>,
  fn: () => Promise<void>,
): Promise<void> {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(vars)) {
    previous[key] = Deno.env.get(key);
    if (value === undefined) Deno.env.delete(key);
    else Deno.env.set(key, value);
  }
  resetContextFixtureState();
  try {
    await fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
    resetContextFixtureState();
  }
}

Deno.test({
  name:
    "SF_CONTEXT_FILE - fixture values seed the initial context of top-level scenarios",
  ...fixtureTestOptions,
  async fn() {
    const file = await Deno.makeTempFile({ suffix: ".json" });
    try {
      await Deno.writeTextFile(
        file,
        JSON.stringify({ token: "from-fixture", userId: 9 }),
      );
      await withEnv(
        { [CONTEXT_FILE_ENV_KEY]: file, [CONTEXT_OUT_ENV_KEY]: undefined },
        async () => {
          const seen: Record<string, unknown> = {};
          const parent = new ScenarioFlow<
            { token: string; userId: number }
          >("parent", config)
            .step("read", async (ctx) => {
              await Promise.resolve();
              seen.parentToken = ctx.getContext("token");
              ctx.setContext("token", "set by step");
            });
          const child = parent.extend("child").step("read", async (ctx) => {
            await Promise.resolve();
            seen.childToken = ctx.getContext("token");
            seen.childUserId = ctx.getContext("userId");
          });

          await captureLog(async () => {
            await parent.execute();
            await child.execute();
          });

          assertEquals(seen.parentToken, "from-fixture");
          // Steps override the fixture; the child inherits the parent's
          // construction-time snapshot and re-runs the parent's step.
          assertEquals(seen.childToken, "set by step");
          assertEquals(seen.childUserId, 9);
        },
      );
    } finally {
      await Deno.remove(file);
    }
  },
});

Deno.test({
  name:
    "SF_CONTEXT_FILE - unreadable or invalid file warns once and is ignored",
  ...fixtureTestOptions,
  async fn() {
    const file = await Deno.makeTempFile({ suffix: ".json" });
    try {
      await Deno.writeTextFile(file, "not json");
      await withEnv(
        { [CONTEXT_FILE_ENV_KEY]: file, [CONTEXT_OUT_ENV_KEY]: undefined },
        async () => {
          const lines = await captureLog(async () => {
            new ScenarioFlow("a", config);
            new ScenarioFlow("b", config);
            await Promise.resolve();
          });
          const warnings = lines.filter((l) =>
            l.includes(`${CONTEXT_FILE_ENV_KEY}=${file} ignored`)
          );
          assertEquals(warnings.length, 1);
        },
      );

      await withEnv(
        {
          [CONTEXT_FILE_ENV_KEY]: `${file}.missing`,
          [CONTEXT_OUT_ENV_KEY]: undefined,
        },
        async () => {
          let value: unknown = "not run";
          const flow = new ScenarioFlow("a", config).step(
            "read",
            async (ctx) => {
              await Promise.resolve();
              value = ctx.getContext("token");
            },
          );
          await captureLog(() => flow.execute());
          assertEquals(value, undefined);
        },
      );
    } finally {
      await Deno.remove(file);
    }
  },
});

Deno.test({
  name:
    "SF_CONTEXT_OUT - context is written after a successful execute() with serializable values only",
  ...fixtureTestOptions,
  async fn() {
    const file = await Deno.makeTempFile({ suffix: ".json" });
    try {
      await withEnv(
        { [CONTEXT_OUT_ENV_KEY]: file, [CONTEXT_FILE_ENV_KEY]: undefined },
        async () => {
          const first = new ScenarioFlow("first", config).step(
            "set",
            async (ctx) => {
              await Promise.resolve();
              ctx.setContext("userId", 1);
              ctx.setContext("response", new Response("x"));
              ctx.setContext("fn", () => 1);
            },
          );
          const second = new ScenarioFlow("second", config).step(
            "set",
            async (ctx) => {
              await Promise.resolve();
              ctx.setContext("token", "abc");
              ctx.setContext("userId", 2);
            },
          );
          const failing = new ScenarioFlow("failing", config).step(
            "boom",
            async (ctx) => {
              await Promise.resolve();
              ctx.setContext("token", "never written");
              throw new Error("boom");
            },
          );

          const lines = await captureLog(async () => {
            await first.execute();
            await second.execute();
            await assertRejects(() => failing.execute(), Error, "boom");
          });

          // Values accumulate across scenarios of the process; the failed
          // scenario does not write.
          assertEquals(JSON.parse(await Deno.readTextFile(file)), {
            userId: 2,
            token: "abc",
          });
          assertEquals(
            lines.filter((l) => l.includes(`Context written to`)).length,
            2,
          );
        },
      );
    } finally {
      await Deno.remove(file);
    }
  },
});

Deno.test({
  name:
    "SF_CONTEXT_OUT then SF_CONTEXT_FILE - a context round-trips through the file",
  ...fixtureTestOptions,
  async fn() {
    const file = await Deno.makeTempFile({ suffix: ".json" });
    try {
      await withEnv(
        { [CONTEXT_OUT_ENV_KEY]: file, [CONTEXT_FILE_ENV_KEY]: undefined },
        async () => {
          const setup = new ScenarioFlow<{ token: string }>("setup", config)
            .step("login", async (ctx) => {
              await Promise.resolve();
              ctx.setContext("token", "round-trip");
            });
          await captureLog(() => setup.execute());
        },
      );

      await withEnv(
        { [CONTEXT_FILE_ENV_KEY]: file, [CONTEXT_OUT_ENV_KEY]: undefined },
        async () => {
          let token: string | undefined;
          const flow = new ScenarioFlow<{ token: string }>("use", config)
            .step("read", async (ctx) => {
              await Promise.resolve();
              token = ctx.getContext("token");
            });
          await captureLog(() => flow.execute());
          assertEquals(token, "round-trip");
        },
      );
    } finally {
      await Deno.remove(file);
    }
  },
});
