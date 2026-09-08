/**
 * Helpers for tests that need `net` / `read` / `env` permissions.
 *
 * `Deno.test({ permissions })` can only narrow the permissions the test runner
 * was started with, so a test that needs e.g. `--allow-net` would fail with
 * `NotCapable` under a bare `deno test`. Gate such tests with
 * {@link permissionTestOptions}: they declare the permissions they need and
 * are ignored (not failed) when those were not granted.
 *
 * @example
 * ```ts
 * Deno.test({
 *   name: "talks to a local server",
 *   ...permissionTestOptions({ net: true, env: ["SF_API_BASE_URL"] }),
 *   fn: async () => { ... },
 * });
 * ```
 */

/** Subset of `Deno.PermissionOptionsObject` used by the test suite. */
export interface TestPermissions {
  /** Network access (`--allow-net`). */
  net?: boolean;
  /** File-system read access (`--allow-read`). */
  read?: boolean;
  /** Environment access: `true` for all variables, or a list of names. */
  env?: boolean | readonly string[];
}

/** Whether every permission in `perms` is currently granted. */
export function hasPermissions(perms: TestPermissions): boolean {
  if (perms.net && !isGranted({ name: "net" })) return false;
  if (perms.read && !isGranted({ name: "read" })) return false;
  if (perms.env === true && !isGranted({ name: "env" })) return false;
  if (Array.isArray(perms.env)) {
    for (const variable of perms.env) {
      if (!isGranted({ name: "env", variable })) return false;
    }
  }
  return true;
}

/**
 * `Deno.test` options that run the test with exactly `perms` and ignore it
 * when they were not granted to the test runner.
 */
export function permissionTestOptions(
  perms: TestPermissions,
): { permissions: Deno.PermissionOptionsObject; ignore: boolean } {
  return {
    permissions: {
      net: perms.net ?? false,
      read: perms.read ?? false,
      env: perms.env === undefined
        ? false
        : typeof perms.env === "boolean"
        ? perms.env
        : [...perms.env],
    },
    ignore: !hasPermissions(perms),
  };
}

function isGranted(desc: Deno.PermissionDescriptor): boolean {
  return Deno.permissions.querySync(desc).state === "granted";
}
