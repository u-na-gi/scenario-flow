import { ScenarioFlow } from "../../../scenario-flow/mod.ts";
import { login } from "./login.sf.ts";


const getData = new ScenarioFlow(login)
  .step(async (ctx) => {
    const token = ctx.getContext<string>("token");
    if (!token) {
      throw new Error("Token not found");
    }

    const res = await ctx.fetcher(
      {
        method: "GET",
        urlPaths: ["api/data"],
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      },
    );

    if (res.ok) {
      const data = await res.json();
      console.log("Data:", data);
    }
  })


if (import.meta.main) {
  await getData.execute();
}