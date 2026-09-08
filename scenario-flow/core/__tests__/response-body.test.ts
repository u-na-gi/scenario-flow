import { assertEquals, assertStringIncludes } from "@std/assert";
import {
  classifyContentType,
  describeResponseBody,
  formatHexDump,
  isBinaryContentType,
  isHexLoggingEnabled,
  looksBinary,
  parseMimeType,
} from "../response-body.ts";
import { ScenarioLogger } from "../logger.ts";

const encoder = new TextEncoder();

/** Run `fn` with console.log captured; returns the captured lines. */
function captureLog(fn: () => void): string[] {
  const originalLog = console.log;
  const lines: string[] = [];
  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  try {
    fn();
  } finally {
    console.log = originalLog;
  }
  return lines;
}

Deno.test("parseMimeType - strips parameters and normalizes case", () => {
  assertEquals(
    parseMimeType("Application/JSON; charset=utf-8"),
    "application/json",
  );
  assertEquals(parseMimeType("  text/plain "), "text/plain");
  assertEquals(parseMimeType(""), null);
  assertEquals(parseMimeType(";charset=utf-8"), null);
  assertEquals(parseMimeType(null), null);
});

Deno.test("isBinaryContentType - binary types", () => {
  const binary = [
    "application/octet-stream",
    "application/octet-stream; charset=binary",
    "application/x-protobuf",
    "application/protobuf",
    "application/grpc",
    "application/pdf",
    "application/zip",
    "application/gzip",
    "application/x-gzip",
    "application/wasm",
    "application/msgpack",
    "image/png",
    "image/svg",
    "audio/mpeg",
    "video/mp4",
    "font/woff2",
    "IMAGE/JPEG",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ];
  for (const ct of binary) {
    assertEquals(isBinaryContentType(ct), true, `expected binary: ${ct}`);
    assertEquals(classifyContentType(ct), "binary", ct);
  }
});

Deno.test("isBinaryContentType - text types", () => {
  const text = [
    "text/plain",
    "text/html; charset=utf-8",
    "text/csv",
    "application/json",
    "application/json; charset=utf-8",
    "application/problem+json",
    "application/vnd.api+json",
    "application/xml",
    "application/atom+xml",
    "image/svg+xml",
    "application/x-www-form-urlencoded",
    "application/javascript",
    "application/x-ndjson",
    "APPLICATION/JSON",
  ];
  for (const ct of text) {
    assertEquals(isBinaryContentType(ct), false, `expected text: ${ct}`);
    assertEquals(classifyContentType(ct), "text", ct);
  }
});

Deno.test("classifyContentType - missing or unrecognized types are unknown", () => {
  assertEquals(classifyContentType(null), "unknown");
  assertEquals(classifyContentType(""), "unknown");
  assertEquals(classifyContentType("application/x-custom"), "unknown");
  assertEquals(
    classifyContentType("multipart/form-data; boundary=x"),
    "unknown",
  );
  assertEquals(isBinaryContentType(null), false);
  assertEquals(isBinaryContentType("application/x-custom"), false);
});

Deno.test("looksBinary - plain ASCII and UTF-8 text are not binary", () => {
  assertEquals(looksBinary(encoder.encode("hello world")), false);
  assertEquals(looksBinary(encoder.encode("line1\r\nline2\ttab\n")), false);
  assertEquals(looksBinary(encoder.encode("日本語のテキスト 🎯")), false);
  assertEquals(looksBinary(new Uint8Array(0)), false);
});

Deno.test("looksBinary - control characters mean binary", () => {
  assertEquals(looksBinary(new Uint8Array([0x68, 0x69, 0x00])), true); // NUL
  assertEquals(looksBinary(new Uint8Array([0x08, 0x01, 0x12, 0x03])), true); // protobuf-ish
  assertEquals(looksBinary(new Uint8Array([0x1b, 0x5b])), true); // ESC
  assertEquals(looksBinary(new Uint8Array([0x41, 0x7f])), true); // DEL
});

Deno.test("looksBinary - invalid UTF-8 means binary", () => {
  assertEquals(looksBinary(new Uint8Array([0xff, 0xfe, 0x41])), true);
  assertEquals(looksBinary(new Uint8Array([0x89, 0x50, 0x4e, 0x47])), true); // PNG-like
  assertEquals(looksBinary(new Uint8Array([0xc3])), true); // truncated 2-byte seq, whole body
});

Deno.test("looksBinary - multibyte char cut at the sniff boundary is not binary", () => {
  // 511 ASCII bytes followed by a 3-byte char: the sample (512 bytes) ends
  // mid-sequence, which must not be reported as invalid UTF-8.
  const text = "a".repeat(511) + "日" + "b".repeat(100);
  const bytes = encoder.encode(text);
  assertEquals(bytes.length > 512, true);
  assertEquals(looksBinary(bytes), false);
});

Deno.test("looksBinary - only inspects the leading bytes", () => {
  const bytes = new Uint8Array(1024).fill(0x41);
  bytes[1000] = 0x00; // beyond the sniff window
  assertEquals(looksBinary(bytes), false);
});

Deno.test("formatHexDump - formats bytes as lower-case hex pairs", () => {
  assertEquals(
    formatHexDump(new Uint8Array([0x0a, 0x1b, 0xff, 0x00])),
    "0a 1b ff 00",
  );
  assertEquals(formatHexDump(new Uint8Array(0)), "");
});

Deno.test("formatHexDump - truncates to max bytes and marks the cut", () => {
  const bytes = new Uint8Array(100).map((_, i) => i);
  const dump = formatHexDump(bytes);
  const pairs = dump.replace(/ \.\.\.$/, "").split(" ");
  assertEquals(pairs.length, 64);
  assertEquals(pairs[0], "00");
  assertEquals(pairs[63], "3f");
  assertEquals(dump.endsWith(" ..."), true);

  assertEquals(formatHexDump(new Uint8Array([1, 2, 3]), 2), "01 02 ...");
  assertEquals(formatHexDump(new Uint8Array([1, 2]), 2), "01 02");
});

Deno.test("isHexLoggingEnabled - follows SF_LOG_BINARY", () => {
  const original = Deno.env.get("SF_LOG_BINARY");
  try {
    Deno.env.delete("SF_LOG_BINARY");
    assertEquals(isHexLoggingEnabled(), false);
    Deno.env.set("SF_LOG_BINARY", "hex");
    assertEquals(isHexLoggingEnabled(), true);
    Deno.env.set("SF_LOG_BINARY", "HEX ");
    assertEquals(isHexLoggingEnabled(), true);
    Deno.env.set("SF_LOG_BINARY", "off");
    assertEquals(isHexLoggingEnabled(), false);
  } finally {
    if (original === undefined) {
      Deno.env.delete("SF_LOG_BINARY");
    } else {
      Deno.env.set("SF_LOG_BINARY", original);
    }
  }
});

Deno.test("describeResponseBody - text content type decodes as text", () => {
  const body = describeResponseBody(
    encoder.encode('{"ok":true}'),
    "application/json; charset=utf-8",
  );
  assertEquals(body, { kind: "text", text: '{"ok":true}' });
});

Deno.test("describeResponseBody - empty body is empty text", () => {
  assertEquals(
    describeResponseBody(new Uint8Array(0), "application/octet-stream"),
    {
      kind: "text",
      text: "",
    },
  );
});

Deno.test("describeResponseBody - binary content type is summarized", () => {
  const body = describeResponseBody(
    encoder.encode("looks like text but declared binary"),
    "application/octet-stream",
    { hex: false },
  );
  assertEquals(body, {
    kind: "binary",
    size: 35,
    contentType: "application/octet-stream",
  });
});

Deno.test("describeResponseBody - unknown content type sniffs bytes", () => {
  const textBody = describeResponseBody(encoder.encode("plain text"), null, {
    hex: false,
  });
  assertEquals(textBody, { kind: "text", text: "plain text" });

  const binaryBody = describeResponseBody(
    new Uint8Array([0x08, 0x01, 0x12, 0x03, 0xff]),
    null,
    { hex: false },
  );
  assertEquals(binaryBody, { kind: "binary", size: 5, contentType: null });

  const customBody = describeResponseBody(
    new Uint8Array([0x00, 0x01]),
    "application/x-custom; v=1",
    { hex: false },
  );
  assertEquals(customBody, {
    kind: "binary",
    size: 2,
    contentType: "application/x-custom",
  });
});

Deno.test("describeResponseBody - hex option adds a hex dump", () => {
  const body = describeResponseBody(
    new Uint8Array([0x0a, 0x1b, 0x00]),
    "application/x-protobuf",
    { hex: true },
  );
  assertEquals(body, {
    kind: "binary",
    size: 3,
    contentType: "application/x-protobuf",
    hex: "0a 1b 00",
  });
});

Deno.test("describeResponseBody - hex defaults to SF_LOG_BINARY env", () => {
  const original = Deno.env.get("SF_LOG_BINARY");
  try {
    Deno.env.set("SF_LOG_BINARY", "hex");
    const withHex = describeResponseBody(new Uint8Array([1, 2]), "image/png");
    assertEquals(withHex.kind === "binary" && withHex.hex, "01 02");

    Deno.env.delete("SF_LOG_BINARY");
    const withoutHex = describeResponseBody(
      new Uint8Array([1, 2]),
      "image/png",
    );
    assertEquals(withoutHex.kind === "binary" && withoutHex.hex, undefined);
  } finally {
    if (original === undefined) {
      Deno.env.delete("SF_LOG_BINARY");
    } else {
      Deno.env.set("SF_LOG_BINARY", original);
    }
  }
});

Deno.test("ScenarioLogger.logResponse - string body is still supported", () => {
  const logger = new ScenarioLogger();
  const lines = captureLog(() => logger.logResponse(200, "OK", 12, "hello"));
  assertEquals(lines.length, 2);
  assertStringIncludes(lines[0], "200 OK");
  assertStringIncludes(lines[1], "📥 hello");
});

Deno.test("ScenarioLogger.logResponse - text body is truncated to 300 chars", () => {
  const logger = new ScenarioLogger();
  const long = "x".repeat(400);
  const lines = captureLog(() =>
    logger.logResponse(200, "OK", 12, { kind: "text", text: long })
  );
  assertStringIncludes(lines[1], "x".repeat(300) + "...");
  assertEquals(lines[1].includes("x".repeat(301)), false);
});

Deno.test("ScenarioLogger.logResponse - empty body prints nothing", () => {
  const logger = new ScenarioLogger();
  assertEquals(
    captureLog(() => logger.logResponse(204, "No Content", 1, "")).length,
    1,
  );
  assertEquals(
    captureLog(() =>
      logger.logResponse(204, "No Content", 1, { kind: "text", text: "" })
    )
      .length,
    1,
  );
  assertEquals(
    captureLog(() => logger.logResponse(204, "No Content", 1)).length,
    1,
  );
});

Deno.test("ScenarioLogger.logResponse - binary body prints placeholder and hex", () => {
  const logger = new ScenarioLogger();
  const lines = captureLog(() =>
    logger.logResponse(200, "OK", 5, {
      kind: "binary",
      size: 123,
      contentType: "application/octet-stream",
      hex: "0a 1b",
    })
  );
  assertEquals(lines.length, 3);
  assertStringIncludes(
    lines[1],
    "📥 [Binary Data] (123 bytes, application/octet-stream)",
  );
  assertStringIncludes(lines[2], "📥 hex: 0a 1b");

  const noType = captureLog(() =>
    logger.logResponse(200, "OK", 5, {
      kind: "binary",
      size: 7,
      contentType: null,
    })
  );
  assertEquals(noType.length, 2);
  assertStringIncludes(noType[1], "📥 [Binary Data] (7 bytes)");
});
