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
  }

  return new Response("Not Found", { status: 404 });
});
