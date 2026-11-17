/**
 * PiTor approval panel
 *
 * Shows the whole design or plan for pitor_approve: wrapped to the width,
 * scrollable, with Approve / Request changes underneath. Mounted as an overlay
 * the same way as the capabilities panel.
 *
 * Up/down scroll, left/right choose, Enter accepts the choice, Escape requests changes.
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import { type Focusable, matchesKey, visibleWidth, wrapTextWithAnsi } from "@mariozechner/pi-tui";

const CHOICES = ["Approve", "Request changes"];

export class ApprovalPanel implements Focusable {
  focused = false;

  private selected = 0;
  private offset = 0;
  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(
    private theme: Theme,
    private title: string,
    private document: string,
    private done: (approved: boolean) => void,
  ) {}

  handleInput(data?: string): void {
    const key = data ?? "";
    if (matchesKey(key, "left") || matchesKey(key, "right")) this.selected = 1 - this.selected;
    else if (matchesKey(key, "up")) this.offset -= 1;
    else if (matchesKey(key, "down")) this.offset += 1;
    else if (matchesKey(key, "pageUp")) this.offset -= 10;
    else if (matchesKey(key, "pageDown")) this.offset += 10;
    else if (matchesKey(key, "enter")) this.done(this.selected === 0);
    else if (matchesKey(key, "escape")) this.done(false);
    else return;
    this.invalidate();
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;

    const t = this.theme;
    const innerW = width - 2;
    const pad = (s: string) => s + " ".repeat(Math.max(0, innerW - visibleWidth(s)));
    const row = (c: string) => t.fg("border", "│") + pad(c) + t.fg("border", "│");

    const body = this.document.split("\n").flatMap((line) => wrapTextWithAnsi(line, innerW - 4));
    const height = Math.max(5, (process.stdout.rows ?? 40) - 12);
    this.offset = Math.max(0, Math.min(this.offset, body.length - height));
    const shown = body.slice(this.offset, this.offset + height);

    const lines: string[] = [];

    const bl = Math.max(0, Math.floor((innerW - this.title.length) / 2));
    const br = Math.max(0, innerW - bl - this.title.length);
    lines.push(
      t.fg("border", "╭" + "─".repeat(bl)) + t.fg("accent", this.title) + t.fg("border", "─".repeat(br) + "╮"),
    );
    lines.push(row(""));
    for (const line of shown) lines.push(row("  " + t.fg("text", line)));
    lines.push(row(""));

    const end = this.offset + shown.length;
    lines.push(row("  " + t.fg("dim", `lines ${this.offset + 1}-${end} of ${body.length}`)));

    const choices = CHOICES.map((c, i) =>
      i === this.selected ? t.fg("accent", "▸ " + c) : t.fg("text", "  " + c),
    );
    lines.push(row("  " + choices.join("    ")));
    lines.push(row(""));
    lines.push(row("  " + t.fg("dim", "↑/↓ scroll  ←/→ choose  enter accept  esc changes")));
    lines.push(t.fg("border", "╰" + "─".repeat(innerW) + "╯"));

    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }

  dispose(): void {}
}
