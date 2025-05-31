import { Application } from "jsr:@oak/oak";
import { authMiddleware } from "./middleware.ts";
import router from "./routes.ts";

// Create Oak application
const app = new Application();

// Set up middleware
app.use(authMiddleware);

// Set up routes
app.use(router.routes());
app.use(router.allowedMethods());

// Add a simple error handler
app.use(async (ctx: any, next: any) => {
  try {
    await next();
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error(`Error: ${error.message}`);

    ctx.response.status = 500;
    ctx.response.body = {
      success: false,
      message: "Internal server error",
      error: error.message,
    };
  }
});

// Define port
const port = 3323;

// Start server
console.log(`Server running on http://localhost:${port}`);
await app.listen({ port });
