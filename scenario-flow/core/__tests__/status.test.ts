import { assertEquals } from "@std/assert";
import {
  formatExpectedStatus,
  formatStatusMismatch,
  isExpectedStatus,
} from "../status.ts";

Deno.test("isExpectedStatus - defaults to the 2xx rule", () => {
  assertEquals(isExpectedStatus(200), true);
  assertEquals(isExpectedStatus(204), true);
  assertEquals(isExpectedStatus(299), true);
  assertEquals(isExpectedStatus(199), false);
  assertEquals(isExpectedStatus(300), false);
  assertEquals(isExpectedStatus(401), false);
  assertEquals(isExpectedStatus(500), false);
});

Deno.test("isExpectedStatus - single expected status", () => {
  assertEquals(isExpectedStatus(401, 401), true);
  assertEquals(isExpectedStatus(200, 401), false);
  // A 2xx is a mismatch when a different status is expected
  assertEquals(isExpectedStatus(200, 201), false);
});

Deno.test("isExpectedStatus - list of expected statuses", () => {
  assertEquals(isExpectedStatus(400, [400, 422]), true);
  assertEquals(isExpectedStatus(422, [400, 422]), true);
  assertEquals(isExpectedStatus(401, [400, 422]), false);
});

Deno.test("isExpectedStatus - accepts readonly tuples", () => {
  const expected = [400, 422] as const;
  assertEquals(isExpectedStatus(422, expected), true);
  assertEquals(isExpectedStatus(500, expected), false);
});

Deno.test("formatExpectedStatus - single and list", () => {
  assertEquals(formatExpectedStatus(401), "401");
  assertEquals(formatExpectedStatus([400, 422]), "400 | 422");
  assertEquals(formatExpectedStatus([400, 422] as const), "400 | 422");
});

Deno.test("formatStatusMismatch - legacy message without expectStatus", () => {
  assertEquals(
    formatStatusMismatch(404, undefined, "GET", "https://api.example.com/x"),
    "HTTP error! status: 404",
  );
});

Deno.test("formatStatusMismatch - descriptive message with expectStatus", () => {
  assertEquals(
    formatStatusMismatch(200, 401, "GET", "https://api.example.com/x"),
    "Expected status 401 but got 200 (GET https://api.example.com/x)",
  );
  assertEquals(
    formatStatusMismatch(500, [400, 422], "POST", "https://api.example.com/y"),
    "Expected status 400 | 422 but got 500 (POST https://api.example.com/y)",
  );
});
