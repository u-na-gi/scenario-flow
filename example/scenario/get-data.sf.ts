import { ScenarioFlow } from "../../scenario-flow/mod.ts";
import { login } from "./login.sf.ts";

const getData = new ScenarioFlow("Get some data", login)
  .step("Get authorized data", async (ctx) => {
    const token = ctx.getContext<string>("token");
    if (!token) {
      throw new Error("Token not found");
    }

    await ctx.fetcher(
      {
        method: "GET",
        urlPaths: ["api/data"],
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
