/**
 * Theme Text Utils - Theme-aware text rendering
 *
 * Provides utilities for styling, truncating, and measuring text
 * while accounting for ANSI color codes and theme colors.
 */

import type { ThemeColor } from "@mariozechner/pi-coding-agent";
import { truncateToWidth as piTruncate, visibleWidth } from "@mariozechner/pi-tui";

// ─── ANSI Processing ──────────────────────────────────────────────────────────

/**
 * Strip all ANSI escape codes from a string.
 * Handles both color codes (\x1b[...m) and special sequences (\x1b_...\x1b\\).
 * @param s - String potentially containing ANSI codes
 * @returns String with codes removed
 */
export function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s
    .replace(/\x1b\[[0-9;]*m/g, "")
    .replace(/\x1b_.*?\x1b\\/g, "");
}

/**
 * Truncate text to a maximum visible width, accounting for ANSI codes.
 * Uses pi-tui's truncateToWidth under the hood.
 * @param s - String to truncate
 * @param width - Maximum visible width
 * @returns Truncated string (preserves ANSI codes)
 */
export function truncateToVisibleWidth(s: string, width: number): string {
  return piTruncate(s, width);
}

// ─── Theme Color Mapping ──────────────────────────────────────────────────────

/**
 * Map a thinking level string to a theme color.
 * @param level - Thinking level ("off", "minimal", "low", "medium", "high", "xhigh")
 * @returns Corresponding theme color key
 */
export function thinkingLevelToColor(level: string): ThemeColor {
  const map: Record<string, ThemeColor> = {
    off: "thinkingOff",
    minimal: "thinkingMinimal",
    low: "thinkingLow",
    medium: "thinkingMedium",
    high: "thinkingHigh",
    xhigh: "thinkingXhigh",
  };
  return map[level] ?? "dim";
}

// ─── Layout ───────────────────────────────────────────────────────────────────

/**
 * Left-align and right-align text within a fixed visible width.
 * Fills space in the middle with padding.
 * @param left - Left-aligned text (may be styled)
 * @param right - Right-aligned text (may be styled)
 * @param totalWidth - Total visible width
 * @returns Left + padding + right
 */
export function layoutLeftRight(
  left: string,
  right: string,
  totalWidth: number
): string {
  const leftVis = visibleWidth(left);
  const rightVis = visibleWidth(right);

  // Happy path: both sides fit with padding.
  if (leftVis + rightVis + 1 <= totalWidth) {
    const pad = totalWidth - leftVis - rightVis;
    return left + " ".repeat(pad) + right;
  }

  // Overflow: try truncating left to make room for right + 1 space separator.
  const leftBudget = totalWidth - rightVis - 1;
  if (leftBudget >= 1) {
    return truncateToVisibleWidth(left, leftBudget) + " " + right;
  }

  // Right alone doesn't fit either: drop it and truncate left to totalWidth.
  return truncateToVisibleWidth(left, totalWidth);
}
