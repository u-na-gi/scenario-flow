import { assertEquals } from "@std/assert";
import { ScenarioFlow } from "../index.ts";
import type { ScenarioFlowConfig } from "../type.ts";

// Regression tests for issue #8: a child scenario used to share the parent's
// context object by reference, so sibling scenarios leaked values into each
// other and into the parent.

const config: ScenarioFlowConfig = { apiBaseUrl: "https://api.example.com" };

const withMockFetch = async (fn: () => Promise<void>): Promise<void> => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (
    _url: string | URL | Request,
    _init?: RequestInit,
  ): Promise<Response> => {
    await Promise.resolve();
    return new Response("ok", { status: 200 });
  };
  try {
    await fn();
  } finally {
    globalThis.fetch = originalFetch;
  }
};

// `leaked` / `own` are never set by the parent itself; they exist so the parent
// can inspect (with a typed key) whether a child wrote into its context.
type ParentCtx = { base: string; leaked?: boolean; own?: number };

const createParent = () =>
  new ScenarioFlow<ParentCtx>("parent", config)
    .step("set base", async (ctx) => {
      await Promise.resolve();
      ctx.setContext("base", "from parent");
    });

Deno.test("Inherit - sibling children do not share context", async () => {
  await withMockFetch(async () => {
    const parent = createParent();

    const a = parent.extend<{ x: number }>("a")
      .step("a sets x", async (ctx) => {
        await Promise.resolve();
        ctx.setContext("x", 1);
      });

    let seenByB: unknown = "not run";
    let baseSeenByB: string | undefined;
    const b = parent.extend<{ x: number }>("b")
      .step("b reads x", async (ctx) => {
        await Promise.resolve();
        seenByB = ctx.getContext("x");
        baseSeenByB = ctx.getContext("base");
      });

    await a.execute();
    await b.execute();

    // b must not see the value written by its sibling a ...
    assertEquals(seenByB, undefined);
    // ... but it does see what the (inherited) parent steps wrote at run time.
    assertEquals(baseSeenByB, "from parent");
  });
});

Deno.test("Inherit - children do not mutate the parent's context", async () => {
  await withMockFetch(async () => {
    const parent = createParent();

    const child = new ScenarioFlow<ParentCtx & { leaked: boolean }>(
      "child",
      parent,
    ).step("child writes", async (ctx) => {
      await Promise.resolve();
      ctx.setContext("leaked", true);
      ctx.setContext("base", "overwritten by child");
    });

    await child.execute();

    // Steps added to the parent after the child was created are not copied
    // into the child, so this step observes the parent's own context.
    let leaked: unknown = "not run";
    let base: string | undefined;
    parent.step("parent inspects", async (ctx) => {
      await Promise.resolve();
      leaked = ctx.getContext("leaked");
      base = ctx.getContext("base");
    });
    await parent.execute();

    assertEquals(leaked, undefined);
    assertEquals(base, "from parent");
  });
});

Deno.test("Inherit - context present at construction is copied, not shared", async () => {
  await withMockFetch(async () => {
    const parent = new ScenarioFlow<{ seed: string; extra?: string }>(
      "parent",
      config,
    ).step("seed", async (ctx) => {
      await Promise.resolve();
      // Only set the seed once so a later execution keeps the original value
      if (ctx.getContext("seed") === undefined) {
        ctx.setContext("seed", "initial");
      }
    });
    await parent.execute();

    // The child is created after the parent has run: it starts from a copy
    // of the parent's current values.
    let seedSeenByChild: string | undefined;
    const child = new ScenarioFlow("child", parent)
      .step("child", async (ctx) => {
        await Promise.resolve();
        seedSeenByChild = ctx.getContext("seed");
        ctx.setContext("seed", "changed by child");
        ctx.setContext("extra", "child only");
      });
    await child.execute();
    assertEquals(seedSeenByChild, "initial");

    let seedSeenByParent: string | undefined;
    let extraSeenByParent: string | undefined;
    parent.step("inspect", async (ctx) => {
      await Promise.resolve();
      seedSeenByParent = ctx.getContext("seed");
      extraSeenByParent = ctx.getContext("extra");
    });
    await parent.execute();
    assertEquals(seedSeenByParent, "initial");
    assertEquals(extraSeenByParent, undefined);
  });
});

Deno.test("Inherit - step(parent) runs the parent's steps against this scenario's context", async () => {
  await withMockFetch(async () => {
    const parent = createParent();

    let base: string | undefined;
    const main = new ScenarioFlow<{ own: number }>("main", config)
      .step(parent)
      .step("read", async (ctx) => {
        await Promise.resolve();
        base = ctx.getContext("base");
        ctx.setContext("own", 1);
      });
    await main.execute();
    assertEquals(base, "from parent");

    // The parent itself stays untouched by main's execution.
    let own: unknown = "not run";
    parent.step("inspect", async (ctx) => {
      await Promise.resolve();
      own = ctx.getContext("own");
    });
    await parent.execute();
    assertEquals(own, undefined);
  });
});

Deno.test("Inherit - child has its own fetcher bound to the copied config", async () => {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  globalThis.fetch = async (
    url: string | URL | Request,
    _init?: RequestInit,
  ): Promise<Response> => {
    await Promise.resolve();
    urls.push(url.toString());
    return new Response("ok", { status: 200 });
  };
  try {
    const parent = new ScenarioFlow("parent", {
      apiBaseUrl: "https://parent.example.com/",
    });
    let childConfigUrl = "";
    const child = new ScenarioFlow("child", parent)
      .step("call", async (ctx) => {
        childConfigUrl = ctx.getConfig().apiBaseUrl;
        await ctx.fetcher({ path: "/ping" });
      });
    await child.execute();

    assertEquals(childConfigUrl, "https://parent.example.com/");
    assertEquals(urls, ["https://parent.example.com/ping"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
