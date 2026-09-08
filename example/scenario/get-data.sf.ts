import { ScenarioFlow } from "../../scenario-flow/mod.ts";
import { login } from "./login.sf.ts";

// Inherits login's steps and its context type (LoginCtx), so
// ctx.getContext("token") below is typed as string | undefined.
const getData = new ScenarioFlow("Get some data", login)
  .step("Get authorized data", async (ctx) => {
    const token = ctx.getContext("token");
    if (!token) {
      throw new Error("Token not found");
    }

    await ctx.fetcher(
      {
        method: "GET",
        path: "/api/data",
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      },
    );

    console.log("データ取得成功");
  });

if (import.meta.main) {
  await getData.execute();
}
