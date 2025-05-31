Deno.serve({
  port: 3323,
  hostname: "0.0.0.0",
}, async (req) => {
  const url = new URL(req.url);

  if (url.pathname === "/login") {
    if (req.method === "POST") {
      const body = await req.json();
      console.log("Request body:", body);

      // Simulate a successful login response
      const response = {
        token: "sample-token-12345",
      };

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      });
    } else {
      return new Response("Method Not Allowed", { status: 405 });
    }
  } else if (url.pathname === "/api/data") {
    if (req.method === "GET") {
      const authorization = req.headers.get("Authorization");
      console.log("Authorization:", authorization);

      if (!authorization || !authorization.startsWith("Bearer ")) {
        return new Response("Unauthorized", { status: 401 });
      }

      // Simulate a successful login response
      const response = {
        data: "data from sample-api2",
      };

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      });
    } else {
      return new Response("Method Not Allowed", { status: 405 });
    }
  } else if (url.pathname === "/api/search") {
    if (req.method === "GET") {
      const authorization = req.headers.get("Authorization");
      console.log("Authorization:", authorization);

      if (!authorization || !authorization.startsWith("Bearer ")) {
        return new Response("Unauthorized", { status: 401 });
      }

      // Get query parameters
      const searchParams = url.searchParams;
      const query = searchParams.get("q") || "";
      const limit = parseInt(searchParams.get("limit") || "10");
      const category = searchParams.get("category") || "all";

      console.log("Search params:", { query, limit, category });

      // Generate response data
      const response = {
        query,
        limit,
        category,
        results: [
          { id: 1, title: `Result for "${query}"`, category },
          { id: 2, title: `Another result for "${query}"`, category },
          { id: 3, title: `Third result for "${query}"`, category },
        ].slice(0, limit),
        total: 3,
      };

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      });
    } else {
      return new Response("Method Not Allowed", { status: 405 });
    }
  }

  return new Response("Not Found", { status: 404 });
});
