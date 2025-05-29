import { Router } from "jsr:@oak/oak";
import { tokenStore } from "./middleware.ts";
import { create } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

// Secret key for JWT signing (in a real app, this would be an environment variable)
const KEY = new TextEncoder().encode("your-secret-key-here");

// Create router
const router = new Router();

// Login endpoint - returns a token
router.post("/login", async (ctx: any) => {
  try {
    // In a real app, you would validate credentials here
    // For simplicity, we'll just generate a token without validation

    // Generate a simple random token
    const tokenId = crypto.randomUUID();

    // Store token in our in-memory store
    tokenStore.add(tokenId);

    // Return the token
    ctx.response.body = {
      success: true,
      token: tokenId,
    };
  } catch (error: unknown) {
    ctx.response.status = 500;
    ctx.response.body = {
      success: false,
      message: "Failed to generate token",
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

// Protected endpoint - user info
router.get("/api/user", (ctx: any) => {
  ctx.response.body = {
    success: true,
    data: {
      id: 1,
      username: "demouser",
      email: "demo@example.com",
    },
  };
});

// Protected endpoint - sample data
router.get("/api/data", (ctx: any) => {
  ctx.response.body = {
    success: true,
    data: [
      { id: 1, name: "Item 1", value: 100 },
      { id: 2, name: "Item 2", value: 200 },
      { id: 3, name: "Item 3", value: 300 },
    ],
  };
});

// Protected endpoint - server status
router.get("/api/status", (ctx: any) => {
  ctx.response.body = {
    success: true,
    status: "online",
    timestamp: new Date().toISOString(),
  };
});

export default router;
