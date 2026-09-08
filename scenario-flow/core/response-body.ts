/**
 * Helpers for deciding how an HTTP response body should be logged:
 * as text, or as a `[Binary Data]` placeholder (optionally with a hex dump).
 *
 * @module
 */

/** Result of classifying a `Content-Type` header. */
export type ContentTypeKind = "text" | "binary" | "unknown";

/**
 * Structured description of a response body for logging.
 * Accepted by `ScenarioLogger.logResponse()` in `logger.ts`.
 */
export type ResponseBodyLog =
  | {
    /** Body is textual and can be printed as-is. */
    kind: "text";
    /**
     * Decoded body text. Only the first {@link TEXT_PREVIEW_BYTES} bytes are
     * decoded; `...` is appended when the body was cut.
     */
    text: string;
  }
  | {
    /** Body is binary and must not be printed raw. */
    kind: "binary";
    /** Body size in bytes */
    size: number;
    /** Normalized MIME type (without parameters), if known */
    contentType: string | null;
    /** Hex dump of the leading bytes, if enabled */
    hex?: string;
  };

/** Options for {@link describeResponseBody}. */
export interface DescribeResponseBodyOptions {
  /** Include a hex dump of the leading bytes for binary bodies. Defaults to `SF_LOG_BINARY=hex`. */
  hex?: boolean;
}

/** Number of bytes shown by the hex dump. */
export const HEX_DUMP_BYTES = 64;

/** Number of leading bytes decoded for the text preview. */
export const TEXT_PREVIEW_BYTES = 1024;

/** Number of leading bytes inspected when sniffing a body of unknown type. */
const SNIFF_BYTES = 512;

const TEXT_MIME_TYPES: ReadonlySet<string> = new Set([
  "application/json",
  "application/xml",
  "application/x-www-form-urlencoded",
  "application/javascript",
  "application/x-javascript",
  "application/ecmascript",
  "application/graphql",
  "application/x-ndjson",
  "application/ld+json",
  "application/x-yaml",
  "application/yaml",
  "application/sql",
]);

const BINARY_MIME_TYPES: ReadonlySet<string> = new Set([
  "application/octet-stream",
  "application/x-protobuf",
  "application/protobuf",
  "application/vnd.google.protobuf",
  "application/x-google-protobuf",
  "application/grpc",
  "application/grpc+proto",
  "application/msgpack",
  "application/x-msgpack",
  "application/vnd.msgpack",
  "application/cbor",
  "application/avro",
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed",
  "application/gzip",
  "application/x-gzip",
  "application/x-tar",
  "application/x-bzip2",
  "application/x-xz",
  "application/x-7z-compressed",
  "application/x-rar-compressed",
  "application/vnd.rar",
  "application/wasm",
  "application/java-archive",
  "application/x-sqlite3",
  "application/vnd.sqlite3",
  "application/x-shockwave-flash",
  "application/vnd.ms-excel",
  "application/msword",
  "application/vnd.ms-powerpoint",
]);

const BINARY_MIME_PREFIXES: readonly string[] = [
  "image/",
  "audio/",
  "video/",
  "font/",
  "model/",
  "application/font-",
  "application/x-font-",
  "application/vnd.openxmlformats-officedocument.",
];

/**
 * Extract the lower-cased MIME type (without parameters such as `charset`)
 * from a `Content-Type` header value.
 * @returns The MIME type, or `null` when the header is missing or empty.
 */
export function parseMimeType(contentType: string | null): string | null {
  if (!contentType) return null;
  const mime = contentType.split(";")[0].trim().toLowerCase();
  return mime === "" ? null : mime;
}

/**
 * Extract the lower-cased `charset` parameter from a `Content-Type` header
 * value, e.g. `"shift_jis"` for `text/plain; charset=Shift_JIS`.
 * @returns The charset label, or `null` when absent.
 */
export function parseCharset(contentType: string | null): string | null {
  if (!contentType) return null;
  const match = /;\s*charset\s*=\s*"?([^";\s]+)"?/i.exec(contentType);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Classify a `Content-Type` header value.
 *
 * - `"text"`: `text/*`, JSON/XML (including `+json` / `+xml` suffixes),
 *   form-urlencoded, JavaScript and similar
 * - `"binary"`: `application/octet-stream`, protobuf, `image/*`, `audio/*`,
 *   `video/*`, PDF, archives and similar
 * - `"unknown"`: header missing or not recognized (callers should sniff bytes)
 */
export function classifyContentType(
  contentType: string | null,
): ContentTypeKind {
  const mime = parseMimeType(contentType);
  if (mime === null) return "unknown";

  if (mime.startsWith("text/")) return "text";
  if (mime.endsWith("+json") || mime.endsWith("+xml")) return "text";
  if (TEXT_MIME_TYPES.has(mime)) return "text";

  if (BINARY_MIME_TYPES.has(mime)) return "binary";
  if (BINARY_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix))) {
    return "binary";
  }

  return "unknown";
}

/**
 * Whether a `Content-Type` header denotes a binary payload
 * (e.g. `application/octet-stream`, `application/x-protobuf`, `image/png`).
 * Missing or unrecognized types return `false`.
 */
export function isBinaryContentType(contentType: string | null): boolean {
  return classifyContentType(contentType) === "binary";
}

/**
 * Drop an incomplete trailing UTF-8 sequence from a sample that was cut off
 * mid-body, so that truncation is not mistaken for invalid UTF-8.
 */
function trimPartialUtf8Tail(sample: Uint8Array): Uint8Array {
  let i = sample.length - 1;
  let continuation = 0;
  while (i >= 0 && continuation < 3 && (sample[i] & 0xC0) === 0x80) {
    i--;
    continuation++;
  }
  if (i < 0) return sample;

  const lead = sample[i];
  const needed = lead >= 0xF0 ? 4 : lead >= 0xE0 ? 3 : lead >= 0xC0 ? 2 : 1;
  return needed > continuation + 1 ? sample.subarray(0, i) : sample;
}

/**
 * Heuristically decide whether bytes look binary by inspecting the leading
 * bytes: control characters other than `\t`, `\n`, `\r` or invalid UTF-8
 * mean binary.
 */
export function looksBinary(bytes: Uint8Array): boolean {
  const truncated = bytes.length > SNIFF_BYTES;
  let sample = truncated ? bytes.subarray(0, SNIFF_BYTES) : bytes;

  for (const b of sample) {
    const isControl = (b < 0x20 && b !== 0x09 && b !== 0x0A && b !== 0x0D) ||
      b === 0x7F;
    if (isControl) return true;
  }

  if (truncated) sample = trimPartialUtf8Tail(sample);
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(sample);
    return false;
  } catch {
    return true;
  }
}

/** Create a decoder for `charset`, falling back to UTF-8 on unknown labels. */
function createTextDecoder(charset: string | null): TextDecoder {
  if (charset) {
    try {
      return new TextDecoder(charset);
    } catch {
      // Unknown or unsupported label: fall back to UTF-8
    }
  }
  return new TextDecoder();
}

/**
 * Decode a text body for logging. Only the first {@link TEXT_PREVIEW_BYTES}
 * bytes are decoded (the logger prints at most 300 characters); `...` is
 * appended when the body was cut.
 */
function decodeTextPreview(
  bytes: Uint8Array,
  contentType: string | null,
): string {
  const decoder = createTextDecoder(parseCharset(contentType));
  if (bytes.length <= TEXT_PREVIEW_BYTES) {
    return decoder.decode(bytes);
  }
  let sample = bytes.subarray(0, TEXT_PREVIEW_BYTES);
  if (decoder.encoding === "utf-8") {
    sample = trimPartialUtf8Tail(sample);
  }
  return decoder.decode(sample) + "...";
}

/**
 * Format the leading bytes as a space-separated lower-case hex string,
 * e.g. `0a 1b ff`. Appends `...` when more bytes exist than shown.
 * @param bytes - Bytes to format
 * @param max - Maximum number of bytes to include (default 64)
 */
export function formatHexDump(
  bytes: Uint8Array,
  max: number = HEX_DUMP_BYTES,
): string {
  const shown = bytes.subarray(0, max);
  const hex = Array.from(shown, (b) => b.toString(16).padStart(2, "0")).join(
    " ",
  );
  return bytes.length > max ? `${hex} ...` : hex;
}

/**
 * Whether `SF_LOG_BINARY=hex` is set. Never throws (and never prompts) when
 * the env permission is missing; defaults to `false`.
 */
export function isHexLoggingEnabled(): boolean {
  try {
    const permissions = (globalThis as { Deno?: typeof Deno }).Deno
      ?.permissions;
    if (permissions?.querySync) {
      const { state } = permissions.querySync({
        name: "env",
        variable: "SF_LOG_BINARY",
      });
      if (state !== "granted") return false;
    }
    return Deno.env.get("SF_LOG_BINARY")?.trim().toLowerCase() === "hex";
  } catch {
    return false;
  }
}

/**
 * Decide how a response body should be logged.
 *
 * Text bodies are decoded with `TextDecoder` (honoring the `charset`
 * parameter, UTF-8 by default) up to {@link TEXT_PREVIEW_BYTES} bytes; binary
 * bodies (by `Content-Type`, or by sniffing when the type is unknown) are
 * described by size and type only, plus a hex dump of the first
 * {@link HEX_DUMP_BYTES} bytes when hex logging is enabled.
 *
 * @param bytes - Full response body
 * @param contentType - Value of the response `Content-Type` header
 * @param options - Overrides (e.g. force `hex` on/off instead of reading env)
 */
export function describeResponseBody(
  bytes: Uint8Array,
  contentType: string | null,
  options: DescribeResponseBodyOptions = {},
): ResponseBodyLog {
  if (bytes.length === 0) {
    return { kind: "text", text: "" };
  }

  const kind = classifyContentType(contentType);
  const binary = kind === "binary" ||
    (kind === "unknown" && looksBinary(bytes));

  if (!binary) {
    return { kind: "text", text: decodeTextPreview(bytes, contentType) };
  }

  const hex = options.hex ?? isHexLoggingEnabled();
  return {
    kind: "binary",
    size: bytes.length,
    contentType: parseMimeType(contentType),
    ...(hex ? { hex: formatHexDump(bytes) } : {}),
  };
}
