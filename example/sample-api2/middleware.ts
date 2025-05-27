import { Context, Next } from "oak";

// Simple in-memory token storage
export const tokenStore = new Set<string>();

/**
 * Middleware to validate authentication token
 */
export const authMiddleware = async (ctx: Context, next: Next) => {
  // Skip token validation for login endpoint
  if (ctx.request.url.pathname === "/login") {
    return await next();
  }

  // Get authorization header
  const authHeader = ctx.request.headers.get("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    ctx.response.status = 401;
    ctx.response.body = {
      success: false,
      message: "Authentication token is missing or invalid",
    };
    return;
  }

  // Extract token
  const token = authHeader.split(" ")[1];

  // Validate token (simple check if token exists in our store)
  if (!tokenStore.has(token)) {
    ctx.response.status = 401;
    ctx.response.body = {
      success: false,
      message: "Invalid or expired token",
    };
    return;
  }

  // Token is valid, proceed to the next middleware/route handler
  await next();
};
