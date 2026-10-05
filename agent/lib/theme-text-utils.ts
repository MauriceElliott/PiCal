/**
 * Theme Text Utils - Theme-aware text rendering
 *
 * Provides utilities for styling, truncating, and measuring text
 * while accounting for ANSI color codes and theme colors.
 */

import type { Theme, ThemeColor } from "@mariozechner/pi-coding-agent";
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
 * Measure the visible width of a string (accounting for ANSI codes).
 * Uses pi-tui's visibleWidth under the hood.
 * @param s - String to measure
 * @returns Visible character width
 */
export function getVisibleWidth(s: string): number {
  return visibleWidth(s);
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

// ─── Theme-Aware Styling ──────────────────────────────────────────────────────

/**
 * Colorize text using a theme color.
 * @param text - Text to colorize
 * @param colorKey - Theme color key
 * @param theme - Theme object
 * @returns Styled text (theme.fg applied)
 */
export function colorizeText(
  text: string,
  colorKey: ThemeColor,
  theme: Theme
): string {
  return theme.fg(colorKey, text);
}

/**
 * Build a padded string using a theme, accounting for ANSI codes.
 * @param text - Text to pad
 * @param targetWidth - Target visible width
 * @param theme - Theme object (for padding character)
 * @returns Padded string
 */
export function padToVisibleWidth(
  text: string,
  targetWidth: number,
  _theme?: Theme
): string {
  const vis = visibleWidth(text);
  const pad = Math.max(0, targetWidth - vis);
  return text + " ".repeat(pad);
}

/**
 * Truncate styled text to fit within a visible width while preserving theme color.
 * @param text - Already-styled text (may contain ANSI codes)
 * @param width - Maximum visible width
 * @param theme - Theme object
 * @param colorKey - Color to reapply after truncation (if needed)
 * @returns Truncated, styled text
 */
export function truncateStyledText(
  text: string,
  width: number,
  _theme: Theme,
  _colorKey?: ThemeColor
): string {
  return truncateToVisibleWidth(text, width);
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

/**
 * Get a theme color for a percentage/status value.
 * Typical gradient: green (>50%) → yellow (>25%) → red (else).
 * @param percent - Numeric percentage (0-100)
 * @returns Theme color key
 */
export function percentToColor(percent: number): ThemeColor {
  if (percent > 50) return "success";
  if (percent > 25) return "warning";
  return "error";
}

// ─── Multi-part Text Building ─────────────────────────────────────────────────

/**
 * Join multiple styled text segments with separators, accounting for width.
 * Useful for building status lines with separators and alignment.
 * @param segments - Array of { text, width? } (width = visual width if pre-calculated)
 * @param separator - Separator string (already styled)
 * @returns Joined text
 */
export function joinStyledSegments(
  segments: Array<{ text: string; width?: number }>,
  separator: string = " "
): string {
  return segments
    .map((seg) => seg.text)
    .join(separator);
}

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
