import type {
  ApiBaseUrlOption,
  ResolvedScenarioFlowConfig,
  ScenarioFlowConfig,
} from "./type.ts";
import { logger } from "./logger.ts";

/**
 * Environment variable consulted by default when resolving `apiBaseUrl`.
 * A non-empty value takes precedence over the value given in the config.
 */
export const DEFAULT_API_BASE_URL_ENV_KEY = "SF_API_BASE_URL";

/**
 * Overrides that have already been reported via `logger.logInfo`.
 * Keyed by `${envKey}=${value}` so the message is printed once per process
 * per distinct override, not once per scenario construction.
 */
const loggedOverrides = new Set<string>();

/**
 * Read an environment variable without ever throwing.
 *
 * Returns `undefined` when the variable is unset or empty, when the runtime
 * is not Deno, or when `--allow-env` has not been granted for the variable
 * (the permission is queried first so no interactive prompt is triggered).
 *
 * @param key - Environment variable name
 * @returns The non-empty value, or `undefined`
 */
export function readEnvVar(key: string): string | undefined {
  try {
    if (typeof Deno === "undefined") {
      return undefined;
    }
    const status = Deno.permissions?.querySync?.({
      name: "env",
      variable: key,
    });
    if (status && status.state !== "granted") {
      return undefined;
    }
    const value = Deno.env.get(key);
    return value && value.length > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Resolve an `apiBaseUrl` option to a concrete string.
 *
 * Precedence (highest first):
 * 1. The environment variable (`envKey` for the object form, otherwise
 *    {@link DEFAULT_API_BASE_URL_ENV_KEY}) when it is set and non-empty.
 * 2. The configured value: the string itself, the function's return value
 *    (called once, and only when no env override applies), or `default`.
 *
 * When an env override is applied it is reported once per process via
 * `logger.logInfo`.
 *
 * @param option - The `apiBaseUrl` value from {@link ScenarioFlowConfig}
 * @returns The resolved base URL
 */
export function resolveApiBaseUrl(option: ApiBaseUrlOption): string {
  let envKey = DEFAULT_API_BASE_URL_ENV_KEY;
  let fallback: () => string;

  if (typeof option === "string") {
    fallback = () => option;
  } else if (typeof option === "function") {
    fallback = option;
  } else if (
    typeof option === "object" && option !== null &&
    typeof option.default === "string"
  ) {
    envKey = option.envKey || DEFAULT_API_BASE_URL_ENV_KEY;
    fallback = () => option.default;
  } else {
    throw new TypeError(
      "Invalid apiBaseUrl: expected string, () => string, or { default, envKey? }",
    );
  }

  const fromEnv = readEnvVar(envKey);
  if (fromEnv !== undefined) {
    const marker = `${envKey}=${fromEnv}`;
    if (!loggedOverrides.has(marker)) {
      loggedOverrides.add(marker);
      logger.logInfo(`apiBaseUrl overridden by ${envKey}: ${fromEnv}`);
    }
    return fromEnv;
  }

  return fallback();
}

/**
 * Resolve a user-supplied config into its concrete form.
 * Idempotent: passing an already resolved config yields an equal result.
 *
 * @param config - Config as accepted by the `ScenarioFlow` constructor
 * @returns A copy of the config with `apiBaseUrl` resolved to a string
 */
export function resolveConfig(
  config: ScenarioFlowConfig,
): ResolvedScenarioFlowConfig {
  return { ...config, apiBaseUrl: resolveApiBaseUrl(config.apiBaseUrl) };
}
