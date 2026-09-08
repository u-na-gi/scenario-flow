// Setup fixture for `sfcli --setup`: writes values into the context so that
// `use-context.sf.ts` can read them back through SF_CONTEXT_FILE.
import { ScenarioFlow } from "../../../scenario-flow/mod.ts";

type SetupCtx = { token: string; userId: number; response: Response };

const setup = new ScenarioFlow<SetupCtx>("setup", {
  apiBaseUrl: "http://setup.invalid/",
}).step("seed context", async (ctx) => {
  await Promise.resolve();
  ctx.setContext("token", "fixture-token");
  ctx.setContext("userId", 42);
  // Not serializable: must be dropped from the context file
  ctx.setContext("response", new Response("x"));
  console.log("setup-scenario-ran");
});

await setup.execute();
