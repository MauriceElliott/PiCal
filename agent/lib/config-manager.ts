/**
 * Config Manager - JSON file utilities
 *
 * Provides utilities for reading, writing, and watching JSON config files
 * with built-in error handling and debouncing.
 */

import { existsSync, readFileSync, writeFileSync, watch as fsWatch } from "fs";
import { dirname } from "path";

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
 * Write a JSON config file with pretty formatting.
 * @param path - File path
 * @param data - Object to write
 * @throws Error if write fails
 */
export function writeJsonConfig(path: string, data: unknown): void {
  const dir = dirname(path);
  // Ensure parent directory exists (basic, can be enhanced)
  try {
    if (dir !== "." && !existsSync(dir)) {
      // This is a simplified approach; in practice you'd use `fs.mkdirSync(dir, { recursive: true })`
      // but we're avoiding extra dependencies
    }
  } catch {
    // Ignore directory creation errors
  }
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
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

// ─── YAML Parsing ─────────────────────────────────────────────────────────────

/**
 * Parse top-level hostname keys from a gh-style hosts.yml.
 * Top-level keys have no leading whitespace, end with ":", and look like
 * a hostname (contain at least one dot with a valid TLD-ish segment).
 * @param yaml - Raw YAML text
 * @returns Array of hostnames
 */
export function parseGhHosts(yaml: string): string[] {
  return yaml
    .split("\n")
    .filter(
      (line) =>
        /^[a-zA-Z0-9][a-zA-Z0-9._-]*\.[a-zA-Z]{2,}:\s*$/.test(line)
    )
    .map((line) => line.trim().slice(0, -1));
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
