import { assertEquals } from "@std/assert";
import type { ScenarioFlowConfig, ScenarioFlowRequest } from "../type.ts";

Deno.test("ScenarioFlowConfig - interface structure", () => {
  const config: ScenarioFlowConfig = {
    apiBaseUrl: "https://api.example.com",
  };

  assertEquals(typeof config.apiBaseUrl, "string");
  assertEquals(config.apiBaseUrl, "https://api.example.com");
});

Deno.test("ScenarioFlowConfig - various URL formats", () => {
  const configs: ScenarioFlowConfig[] = [
    { apiBaseUrl: "https://api.example.com" },
    { apiBaseUrl: "http://localhost:3000" },
    { apiBaseUrl: "https://api.example.com/" },
    { apiBaseUrl: "https://subdomain.api.example.com/v1" },
  ];

  configs.forEach((config) => {
    assertEquals(typeof config.apiBaseUrl, "string");
    assertEquals(config.apiBaseUrl.length > 0, true);
  });
});

Deno.test("ScenarioFlowRequest - basic structure", () => {
  const request: ScenarioFlowRequest = {
    path: "/users/123",
    method: "GET",
  };

  assertEquals(typeof request.path, "string");
  assertEquals(request.path, "/users/123");

  assertEquals(request.method, "GET");
});

Deno.test("ScenarioFlowRequest - extends RequestInit", () => {
  const request: ScenarioFlowRequest = {
    path: "/api/data",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer token123",
    },
    body: JSON.stringify({ name: "test", value: 123 }),
  };

  assertEquals(typeof request.path, "string");
  assertEquals(request.method, "POST");
  assertEquals(typeof request.headers, "object");
  assertEquals(typeof request.body, "string");
});

Deno.test("ScenarioFlowRequest - various HTTP methods", () => {
  const methods = ["GET", "POST", "PUT", "DELETE", "PATCH"];

  methods.forEach((method) => {
    const request: ScenarioFlowRequest = {
      path: "/test",
      method: method as unknown as "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
    };

    assertEquals(request.method, method);
    assertEquals(typeof request.path, "string");
  });
});

Deno.test("ScenarioFlowRequest - empty path", () => {
  const request: ScenarioFlowRequest = {
    path: "",
    method: "GET",
  };

  assertEquals(typeof request.path, "string");
  assertEquals(request.path.length, 0);
});

Deno.test("ScenarioFlowRequest - complex path", () => {
  const request: ScenarioFlowRequest = {
    path: "/api/v1/users/123/profile/settings",
    method: "GET",
  };

  assertEquals(typeof request.path, "string");
  assertEquals(request.path, "/api/v1/users/123/profile/settings");
});

Deno.test("ScenarioFlowRequest - with query parameters in RequestInit", () => {
  const request: ScenarioFlowRequest = {
    path: "/search",
    method: "GET",
    // Note: query parameters would typically be handled in the URL construction
    // but we can test that RequestInit properties are preserved
    cache: "no-cache",
    credentials: "include",
  };

  assertEquals(request.path, "/search");
  assertEquals(request.cache, "no-cache");
  assertEquals(request.credentials, "include");
});

Deno.test("ScenarioFlowRequest - with request body", () => {
  const requestData = {
    username: "testuser",
    email: "test@example.com",
    preferences: {
      theme: "dark",
      notifications: true,
    },
  };

  const request: ScenarioFlowRequest = {
    path: "/users",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestData),
  };

  assertEquals(request.method, "POST");
  assertEquals(typeof request.body, "string");

  const parsedBody = JSON.parse(request.body as string);
  assertEquals(parsedBody.username, "testuser");
  assertEquals(parsedBody.preferences.theme, "dark");
});

Deno.test("ScenarioFlowRequest - path with special characters", () => {
  const request: ScenarioFlowRequest = {
    path: "/users/user@example.com/data-2024/file_name.json",
    method: "GET",
  };

  assertEquals(typeof request.path, "string");
  assertEquals(
    request.path,
    "/users/user@example.com/data-2024/file_name.json",
  );
});

Deno.test("ScenarioFlowRequest - minimal required properties", () => {
  const request: ScenarioFlowRequest = {
    path: "/minimal",
  };

  assertEquals(typeof request.path, "string");
  assertEquals(request.path, "/minimal");
  // method is optional since it extends RequestInit where method has a default
});
