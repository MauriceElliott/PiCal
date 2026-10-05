/**
 * Text Input Component - Reusable multi-line text input
 *
 * Provides a component for text input with:
 * - Word-aware line wrapping
 * - Cursor position tracking
 * - Support for paste/multi-character input
 */

import { CURSOR_MARKER, type Focusable, matchesKey } from "@mariozechner/pi-tui";
import type { Theme } from "@mariozechner/pi-coding-agent";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TextInputOptions {
  placeholder?: string;
  maxLines?: number;
  minContentWidth?: number;
}

export interface WrappedLine {
  text: string;
  start: number; // offset in input buffer where this line begins
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * A reusable multi-line text input component with word-wrapping support.
 * Tracks cursor position precisely across wrapped lines.
 *
 * Usage:
 *   const input = new TextInputComponent(theme, { placeholder: "Type..." });
 *   // Render: input.render(width)
 *   // Handle input: input.handleInput(data)
 *   // Get value: input.getValue()
 */
export class TextInputComponent implements Focusable {
  private buffer: string = "";
  private cursorPos: number = 0;
  private theme: Theme;
  private options: Required<TextInputOptions>;
  private cachedLines?: string[];
  private cachedWidth?: number;

  focused: boolean = false;

  constructor(theme: Theme, options: TextInputOptions = {}) {
    this.theme = theme;
    this.options = {
      placeholder: options.placeholder ?? "type...",
      maxLines: options.maxLines ?? 10,
      minContentWidth: options.minContentWidth ?? 10,
    };
  }

  // ── Public API ──────────────────────────────────────────────────────────

  getValue(): string {
    return this.buffer;
  }

  setValue(text: string): void {
    this.buffer = text;
    this.cursorPos = Math.min(this.cursorPos, text.length);
    this.invalidate();
  }

  clear(): void {
    this.buffer = "";
    this.cursorPos = 0;
    this.invalidate();
  }

  handleInput(data: string): void {
    if (matchesKey(data, "backspace")) {
      if (this.cursorPos > 0) {
        this.buffer =
          this.buffer.slice(0, this.cursorPos - 1) +
          this.buffer.slice(this.cursorPos);
        this.cursorPos--;
      }
    } else if (matchesKey(data, "left")) {
      this.cursorPos = Math.max(0, this.cursorPos - 1);
    } else if (matchesKey(data, "right")) {
      this.cursorPos = Math.min(this.buffer.length, this.cursorPos + 1);
    } else if (matchesKey(data, "home")) {
      this.cursorPos = 0;
    } else if (matchesKey(data, "end")) {
      this.cursorPos = this.buffer.length;
    } else if (data.length >= 1 && data.charCodeAt(0) >= 32 && !data.startsWith("\x1b")) {
      // Printable text (handles paste too)
      this.buffer =
        this.buffer.slice(0, this.cursorPos) +
        data +
        this.buffer.slice(this.cursorPos);
      this.cursorPos += data.length;
    } else {
      return; // unhandled key
    }
    this.invalidate();
  }

  // ── Rendering ───────────────────────────────────────────────────────────

  private wrapText(text: string, availWidth: number): WrappedLine[] {
    const wrapped: WrappedLine[] = [];
    let pos = 0;

    if (text.length === 0) {
      return wrapped;
    }

    while (pos < text.length) {
      if (text.length - pos <= availWidth) {
        // Remainder fits
        wrapped.push({ text: text.slice(pos), start: pos });
        break;
      }

      // Find last space within available width
      let breakAt = -1;
      for (let k = pos + availWidth - 1; k > pos; k--) {
        if (text[k] === " ") {
          breakAt = k + 1;
          break;
        }
      }

      // No space found — hard break
      if (breakAt <= pos) {
        breakAt = pos + availWidth;
      }

      wrapped.push({ text: text.slice(pos, breakAt), start: pos });
      pos = breakAt;
    }

    return wrapped;
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) {
      return this.cachedLines;
    }

    const lines: string[] = [];
    const availWidth = Math.max(this.options.minContentWidth, width);

    if (this.buffer.length === 0) {
      // Show placeholder with cursor
      const placeholder = this.theme.fg("dim", this.options.placeholder);
      const marker = this.focused ? CURSOR_MARKER : "";
      const cursor = `${marker}\x1b[7m \x1b[27m`;
      lines.push(cursor + placeholder);
    } else {
      // Wrap text
      const wrapped = this.wrapText(this.buffer, availWidth);

      // Find which line and column the cursor is on
      let cursorLineIdx = 0;
      for (let li = 0; li < wrapped.length; li++) {
        if (wrapped[li]!.start <= this.cursorPos) {
          cursorLineIdx = li;
        } else {
          break;
        }
      }
      const cursorCol = this.cursorPos - wrapped[cursorLineIdx]!.start;

      // Render each line
      for (let li = 0; li < wrapped.length; li++) {
        const { text: chunk } = wrapped[li]!;

        if (li === cursorLineIdx) {
          // Line with cursor
          const before = chunk.slice(0, cursorCol);
          const atCursor =
            cursorCol < chunk.length ? chunk[cursorCol]! : " ";
          const afterCursor = chunk.slice(cursorCol + 1);
          const marker = this.focused ? CURSOR_MARKER : "";
          const display =
            this.theme.fg("text", before) +
            `${marker}\x1b[7m${atCursor}\x1b[27m` +
            this.theme.fg("text", afterCursor);
          lines.push(display);
        } else {
          lines.push(this.theme.fg("text", chunk));
        }

        // Respect maxLines
        if (lines.length >= this.options.maxLines) {
          break;
        }
      }
    }

    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }

  invalidate(): void {
    this.cachedLines = undefined;
    this.cachedWidth = undefined;
  }

  dispose(): void {
    // Cleanup if needed
  }
}
