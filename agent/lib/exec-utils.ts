/**
 * Exec Utils - Command execution wrappers
 *
 * Provides utilities for executing external commands with consistent
 * error handling and timeouts.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface ExecOptions {
  timeout?: number;
}

// ─── Command Execution ────────────────────────────────────────────────────────

/**
 * Execute a command with timeout and error handling.
 * @param pi - ExtensionAPI instance (for pi.exec)
 * @param command - Command name
 * @param args - Command arguments
 * @param options - Execution options (timeout in ms)
 * @returns Result with code, stdout, stderr
 */
export async function execCommand(
  pi: ExtensionAPI,
  command: string,
  args: string[] = [],
  options: ExecOptions = {}
): Promise<ExecResult> {
  const timeout = options.timeout ?? 5000;
  try {
    const result = await pi.exec(command, args, { timeout });
    return {
      code: result.code,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } catch (error) {
    return {
      code: -1,
      stdout: "",
      stderr: String(error),
    };
  }
}

/**
 * Execute a git command and return trimmed stdout.
 * Throws error if command fails or timeout occurs.
 * @param pi - ExtensionAPI instance
 * @param args - Git subcommand and arguments
 * @param timeout - Timeout in ms (default 3000)
 * @returns Trimmed stdout
 */
export async function execGit(
  pi: ExtensionAPI,
  args: string[],
  timeout: number = 3000
): Promise<string> {
  try {
    const result = await pi.exec("git", args, { timeout });
    if (result.code !== 0) {
      throw new Error(`git ${args[0]} failed: ${result.stderr}`);
    }
    return result.stdout.trim();
  } catch (error) {
    throw new Error(`git execution failed: ${error}`);
  }
}

/**
 * Execute a gh CLI command and return trimmed stdout.
 * Automatically handles hostname if provided.
 * Throws error if command fails or timeout occurs.
 * @param pi - ExtensionAPI instance
 * @param args - gh subcommand and arguments
 * @param hostname - Optional GitHub hostname (for GHE)
 * @param timeout - Timeout in ms (default 8000)
 * @returns Trimmed stdout
 */
export async function execGh(
  pi: ExtensionAPI,
  args: string[],
  hostname?: string,
  timeout: number = 8000
): Promise<string> {
  try {
    const fullArgs = [...args];
    if (hostname && hostname !== "github.com") {
      fullArgs.unshift("--hostname", hostname);
    }
    const result = await pi.exec("gh", fullArgs, { timeout });
    if (result.code !== 0) {
      throw new Error(`gh ${args[0]} failed: ${result.stderr}`);
    }
    return result.stdout.trim();
  } catch (error) {
    throw new Error(`gh execution failed: ${error}`);
  }
}

/**
 * Try executing a command, returning null if it fails (no throw).
 * Useful for optional external tools.
 * @param pi - ExtensionAPI instance
 * @param command - Command name
 * @param args - Command arguments
 * @param options - Execution options
 * @returns Trimmed stdout, or null if failed
 */
export async function tryExec(
  pi: ExtensionAPI,
  command: string,
  args: string[] = [],
  options: ExecOptions = {}
): Promise<string | null> {
  try {
    const result = await execCommand(pi, command, args, options);
    return result.code === 0 ? result.stdout.trim() : null;
  } catch {
    return null;
  }
}
