import { ScenarioFlow } from "../../scenario-flow/mod.ts";
import { login } from "./login.sf.ts";

const searchWithQuery = new ScenarioFlow("Search with Query Parameters", login)
  .step("Search with query parameters", async (ctx) => {
    const token = ctx.getContext<string>("token");
    if (!token) {
      throw new Error("Token not found");
    }

    const res = await ctx.fetcher({
      method: "GET",
      path: "/api/search?q=test&limit=5&category=books",
      headers: {
        "Authorization": `Bearer ${token}`,
      },
    });

    if (res.ok) {
      const data = await res.json();
      console.log("Search results:", data);

      // Validate response structure
      if (data.query !== "test") {
        throw new Error(`Expected query 'test', got '${data.query}'`);
      }
      if (data.limit !== 5) {
        throw new Error(`Expected limit 5, got ${data.limit}`);
      }
      if (data.category !== "books") {
        throw new Error(`Expected category 'books', got '${data.category}'`);
      }
      if (!Array.isArray(data.results)) {
        throw new Error("Expected results to be an array");
      }

      console.log("Query parameter test passed");
    } else {
      throw new Error(`Search request failed with status: ${res.status}`);
    }
  })
  .step("Search with different parameters", async (ctx) => {
    const token = ctx.getContext<string>("token");
    if (!token) {
      throw new Error("Token not found");
    }

    const res = await ctx.fetcher({
      method: "GET",
      path: "/api/search?q=javascript&limit=2&category=programming",
      headers: {
        "Authorization": `Bearer ${token}`,
      },
    });

    if (res.ok) {
      const data = await res.json();
      console.log("Second search results:", data);

      // Validate that limit is respected
      if (data.results.length > 2) {
        throw new Error(`Expected max 2 results, got ${data.results.length}`);
      }

      console.log("Test with different parameters passed");
    } else {
      throw new Error(
        `Second search request failed with status: ${res.status}`,
      );
    }
  })
  .step("Search without query parameter", async (ctx) => {
    const token = ctx.getContext<string>("token");
    if (!token) {
      throw new Error("Token not found");
    }

    const res = await ctx.fetcher({
      method: "GET",
      path: "/api/search",
      headers: {
        "Authorization": `Bearer ${token}`,
      },
    });

    if (res.ok) {
      const data = await res.json();
      console.log("Search results without parameters:", data);

      // Should use default values
      if (data.query !== "") {
        throw new Error(`Expected empty query, got '${data.query}'`);
      }
      if (data.limit !== 10) {
        throw new Error(`Expected default limit 10, got ${data.limit}`);
      }
      if (data.category !== "all") {
        throw new Error(
          `Expected default category 'all', got '${data.category}'`,
        );
      }

      console.log("Default value test passed");
    } else {
      throw new Error(
        `Default search request failed with status: ${res.status}`,
      );
    }
  });

if (import.meta.main) {
  await searchWithQuery.execute();
}

export { searchWithQuery };
