/**
 * Credential Manager - Host discovery and credential utilities
 *
 * Provides utilities for discovering authenticated hosts, normalizing
 * hostnames, and cycling through credentials.
 */

import { readFileSync, readdirSync } from "fs";
import { join } from "path";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CopilotUser {
  host: string;
  login: string;
}

export interface CopilotConfig {
  loggedInUsers?: CopilotUser[];
  lastLoggedInUser?: CopilotUser;
  [key: string]: unknown;
}

export interface PiCredential {
  type?: string;
  refresh: string;
  access: string;
  expires: number;
  enterpriseUrl?: string | null;
}

export interface PiAuthStore {
  "github-copilot"?: PiCredential;
  [key: string]: unknown;
}

// ─── Host Normalization ───────────────────────────────────────────────────────

/**
 * Normalize a GitHub hostname: strip protocol and trailing slash.
 * @param host - URL or hostname (e.g., "https://github.com/" or "github.com")
 * @returns Normalized hostname (e.g., "github.com")
 */
export function normalizeHost(host: string): string {
  return host
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
}

/**
 * Determine which GitHub host a pi credential belongs to.
 * Absence of enterpriseUrl means github.com (the default).
 * @param cred - PI credential object
 * @returns Hostname (e.g., "github.com" or "kb-tech.ghe.com")
 */
export function getHostFromCredential(cred: PiCredential): string {
  return cred.enterpriseUrl
    ? normalizeHost(cred.enterpriseUrl)
    : "github.com";
}

// ─── Discovery ────────────────────────────────────────────────────────────────

/**
 * Discover GitHub hosts from gh CLI's hosts.yml file.
 * Parses top-level YAML keys that match hostname patterns.
 * @param ghHostsPath - Path to ~/.config/gh/hosts.yml
 * @returns Array of hostnames, or empty array if file not found/invalid
 */
export function discoverGhHosts(ghHostsPath: string): string[] {
  try {
    const yaml = readFileSync(ghHostsPath, "utf-8");
    return yaml
      .split("\n")
      .filter(
        (line) =>
          /^[a-zA-Z0-9][a-zA-Z0-9._-]*\.[a-zA-Z]{2,}:\s*$/.test(line)
      )
      .map((line) => line.trim().slice(0, -1));
  } catch {
    return [];
  }
}

/**
 * Discover GitHub hosts from Copilot CLI's config.json file.
 * Returns logged-in users (which include their host info).
 * @param copilotConfigPath - Path to ~/.copilot/config.json
 * @returns Array of CopilotUser objects, or empty array if invalid
 */
export function discoverCopilotUsers(
  copilotConfigPath: string
): CopilotUser[] {
  try {
    const config = JSON.parse(readFileSync(copilotConfigPath, "utf-8")) as CopilotConfig;
    return config.loggedInUsers ?? [];
  } catch {
    return [];
  }
}

/**
 * Discover authenticated hosts from both gh CLI and Copilot CLI.
 * Returns the intersection of hosts that exist in both.
 * @param ghHostsPath - Path to gh hosts.yml
 * @param copilotConfigPath - Path to copilot config.json
 * @returns { hosts: string[], copilotUsers: CopilotUser[] }
 */
export function discoverAuthenticatedHosts(
  ghHostsPath: string,
  copilotConfigPath: string
): { hosts: string[]; copilotUsers: CopilotUser[] } {
  const ghHosts = discoverGhHosts(ghHostsPath);
  const copilotUsers = discoverCopilotUsers(copilotConfigPath);

  const copilotHostSet = new Set(
    copilotUsers.map((u) => normalizeHost(u.host))
  );
  const hosts = ghHosts.filter((h) => copilotHostSet.has(h));

  return { hosts, copilotUsers };
}

// ─── Cycling ──────────────────────────────────────────────────────────────────

/**
 * Rotate to the next item in an array.
 * @param items - Array of items
 * @param current - Current item (used to find index)
 * @param defaultNext - Item to return if current not found
 * @returns Next item in array (wraps around)
 */
export function rotateNext<T>(
  items: T[],
  current: T,
  defaultNext?: T
): T | undefined {
  if (items.length === 0) return defaultNext;
  const idx = items.indexOf(current);
  if (idx < 0) return defaultNext ?? items[0];
  const nextIdx = (idx + 1) % items.length;
  return items[nextIdx];
}

/**
 * Find a Copilot user by hostname.
 * @param copilotUsers - Array of CopilotUser objects
 * @param host - Hostname to search for
 * @returns CopilotUser if found, undefined otherwise
 */
export function findCopilotUserByHost(
  copilotUsers: CopilotUser[],
  host: string
): CopilotUser | undefined {
  return copilotUsers.find(
    (u) => normalizeHost(u.host) === normalizeHost(host)
  );
}

// ─── Credential Path Utilities ────────────────────────────────────────────────

/**
 * Get the sidecar path for a credential associated with a host.
 * Follows the pattern: ~/.pi/agent/auth.{hostname}.json
 * @param piDir - Path to ~/.pi/agent
 * @param host - Hostname
 * @returns Full path to sidecar file
 */
export function getAuthSidecarPath(piDir: string, host: string): string {
  return join(piDir, `auth.${host}.json`);
}

/**
 * Discover available accounts from pi credential sidecar files.
 * Scans piDir for files matching auth.{hostname}.json pattern.
 * This is the authoritative source for which accounts pi has credentials for.
 * @param piDir - Path to ~/.pi/agent
 * @returns Array of hostnames
 */
export function discoverSidecarHosts(piDir: string): string[] {
  try {
    const files = readdirSync(piDir) as string[];
    return files
      .filter((f) => /^auth\..+\.json$/.test(f) && f !== "auth.json")
      .map((f) => f.slice(5, -5)); // strip "auth." prefix and ".json" suffix
  } catch {
    return [];
  }
}

/**
 * Get all sidecar paths for a list of hosts.
 * @param piDir - Path to ~/.pi/agent
 * @param hosts - Array of hostnames
 * @returns Record of hostname → sidecar path
 */
export function getAuthSidecarPaths(
  piDir: string,
  hosts: string[]
): Record<string, string> {
  const paths: Record<string, string> = {};
  for (const host of hosts) {
    paths[host] = getAuthSidecarPath(piDir, host);
  }
  return paths;
}

// ─── Defaults ──────────────────────────────────────────────────────────────────

/**
 * Determine the active GitHub host from settings.json.
 * Handles migration from legacy ghTenant field.
 * @param settingsPath - Path to settings.json
 * @returns Hostname (defaults to "github.com")
 */
export function getActiveHostFromSettings(settingsPath: string): string {
  try {
    const settings = JSON.parse(readFileSync(settingsPath, "utf-8")) as Record<string, unknown>;
    if (typeof settings.activeGhHost === "string") {
      return settings.activeGhHost;
    }
    if (settings.ghTenant === "enterprise") {
      return "kb-tech.ghe.com";
    }
  } catch {
    // Ignore read errors
  }
  return "github.com";
}
