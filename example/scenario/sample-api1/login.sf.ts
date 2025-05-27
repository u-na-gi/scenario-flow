import { ScenarioFlow } from "../../../scenario-flow/mod.ts";

export const login = new ScenarioFlow({
  apiBaseUrl: "http://localhost:3323/",
}).step(async (ctx) => {
  const res = await ctx.fetcher(
    {
      method: "POST",
      urlPaths: ["login"],
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: "demouser",
        password: "password",
      }),
    },
  );

  if (res.ok) {
    const data = await res.json();
    console.log("Login data:", data);
    ctx.addContext("token", data.token);
  }
});

if (import.meta.main) {
  await login.execute();
}
