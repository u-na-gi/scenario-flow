// Reads the context seeded by `setup.sf.ts` (via SF_CONTEXT_FILE) and fails
// when it is missing. Running this file without `--setup` therefore fails.
import { ScenarioFlow } from "../../../scenario-flow/mod.ts";

type Ctx = { token: string; userId: number; response?: Response };

const scenario = new ScenarioFlow<Ctx>("use-context", {
  apiBaseUrl: "http://setup.invalid/",
}).step("read seeded context", async (ctx) => {
  await Promise.resolve();
  const token = ctx.getContext("token");
  const userId = ctx.getContext("userId");
  console.log(`USE_CONTEXT token=${token} userId=${userId}`);
  console.log(`USE_CONTEXT response=${String(ctx.getContext("response"))}`);
  ctx.assert.equal(token, "fixture-token", "token from setup");
  ctx.assert.equal(userId, 42, "userId from setup");
});

await scenario.execute();
