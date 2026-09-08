import { ScenarioFlow } from "../../scenario-flow/mod.ts";

/** Context produced by the login scenario. */
export type LoginCtx = {
  token: string;
};

export const login = new ScenarioFlow<LoginCtx>("User Login", {
  apiBaseUrl: "http://localhost:3323/",
}).step("Exec Login", async (ctx) => {
  const res = await ctx.fetcher(
    {
      method: "POST",
      path: "/login",
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
    ctx.setContext("token", data.token);
  }
});

if (import.meta.main) {
  await login.execute();
}
