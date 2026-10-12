/**
 * Config Manager - JSON file utilities
 *
 * Provides utilities for reading and watching JSON config files
 * with built-in error handling and debouncing.
 */

import { readFileSync, watch as fsWatch } from "fs";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConfigManagerOptions {
  debounceMs?: number;
}

// ─── File Operations ──────────────────────────────────────────────────────────

/**
 * Read a JSON config file with a fallback default value.
 * @param path - File path
 * @param fallback - Default value if file doesn't exist or is invalid
 * @returns Parsed JSON or fallback
 */
export function readJsonConfig<T>(path: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

/**
 * Watch a JSON config file and call a callback when it changes.
 * Includes debouncing to avoid rapid fire callbacks.
 * @param path - File path
 * @param callback - Called with new parsed config, or fallback if invalid
 * @param fallback - Default value if file is invalid
 * @param options - Debounce delay (default 150ms)
 * @returns Cleanup function to stop watching
 */
export function watchJsonConfig<T>(
  path: string,
  callback: (config: T) => void,
  fallback: T,
  options: ConfigManagerOptions = {}
): () => void {
  const debounceMs = options.debounceMs ?? 150;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const watcher = fsWatch(path, () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const config = readJsonConfig(path, fallback);
      callback(config);
    }, debounceMs);
  });

  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    watcher.close();
  };
}

// ─── Path & Date Utilities ────────────────────────────────────────────────────

/**
 * Abbreviate a file path for display.
 * Expands ~ to home, then abbreviates middle directories to first letter.
 * Examples:
 *   /Users/alice/repos/my-project  →  /U/r/my-project
 *   ~/repos/my-project              →  ~/r/my-project
 *   ~/my-project                    →  ~/my-project
 * @param fullPath - Full file path
 * @returns Abbreviated path
 */
export function abbreviatePath(fullPath: string): string {
  const home = process.env.HOME ?? "";
  const rel =
    home && fullPath.startsWith(home)
      ? "~" + fullPath.slice(home.length)
      : fullPath;
  const parts = rel.split("/").filter(Boolean);
  if (parts.length <= 2) return rel;
  const first = parts[0]!;
  const last = parts[parts.length - 1]!;
  const middle = parts.slice(1, -1).map((p) => p[0] ?? p);
  const prefix = rel.startsWith("/") && !rel.startsWith("~") ? "/" : "";
  return prefix + [first, ...middle, last].join("/");
}

/**
 * Format an ISO date string for display (short form).
 * @param isoDate - ISO 8601 date string
 * @returns Formatted date (e.g., "May 1")
 */
export function formatShortDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
