/**
 * Welcome message
 *
 * On startup, pops up an Accept / Cancel dialog (same style as the
 * approval-gate) showing the full contents of ~/.pi/agent/SYSTEM.md.
 *
 * Accept → continue into pi
 * Cancel → quit pi
 */

import type { ExtensionAPI, Theme } from "@mariozechner/pi-coding-agent";
import { type Focusable, matchesKey, visibleWidth, wrapTextWithAnsi } from "@mariozechner/pi-tui";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const SYSTEM_MD = join(homedir(), ".pi", "agent", "SYSTEM.md");
const OPTIONS = ["Accept", "Cancel"] as const;
const BODY_HEIGHT = 40; // max visible content lines before scrolling

type WelcomeResult = "accept" | "cancel";

class WelcomeDialog implements Focusable {
  focused = false;

  private selected = 0;
  private scroll = 0;
  private maxScroll = 0;
  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(
    private theme: Theme,
    private content: string,
    private done: (r: WelcomeResult) => void,
  ) {}

  handleInput(data: string): void {
    if (matchesKey(data, "left") || matchesKey(data, "shift+tab")) {
      this.selected = 0;
    } else if (matchesKey(data, "right") || matchesKey(data, "tab")) {
      this.selected = 1;
    } else if (matchesKey(data, "up")) {
      this.scroll = Math.max(0, this.scroll - 1);
    } else if (matchesKey(data, "down")) {
      this.scroll = Math.min(this.maxScroll, this.scroll + 1);
    } else if (matchesKey(data, "pageUp")) {
      this.scroll = Math.max(0, this.scroll - BODY_HEIGHT);
    } else if (matchesKey(data, "pageDown")) {
      this.scroll = Math.min(this.maxScroll, this.scroll + BODY_HEIGHT);
    } else if (matchesKey(data, "return")) {
      this.done(this.selected === 0 ? "accept" : "cancel");
      return;
    } else if (matchesKey(data, "escape")) {
      this.done("cancel");
      return;
    } else {
      return;
    }
    this.invalidate();
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;

    const t = this.theme;
    const innerW = width - 2;
    const lines: string[] = [];

    const pad = (s: string, len: number) => s + " ".repeat(Math.max(0, len - visibleWidth(s)));
    const row = (c: string) => t.fg("border", "│") + pad(c, innerW) + t.fg("border", "│");

    // Top border
    const title = " Welcome — SYSTEM.md ";
    const bl = Math.max(0, Math.floor((innerW - title.length) / 2));
    const br = Math.max(0, innerW - bl - title.length);
    lines.push(
      t.fg("border", "╭" + "─".repeat(bl)) + t.fg("accent", title) + t.fg("border", "─".repeat(br) + "╮"),
    );
    lines.push(row(""));

    // Body (wrapped + scrollable)
    const body: string[] = [];
    if (!this.content.trim()) {
      body.push(t.fg("dim", "(SYSTEM.md is empty)"));
    } else {
      for (const line of this.content.replace(/\r/g, "").split("\n")) {
        if (line === "") body.push("");
        else body.push(...wrapTextWithAnsi(line, innerW - 4));
      }
    }
    this.maxScroll = Math.max(0, body.length - BODY_HEIGHT);
    this.scroll = Math.min(this.scroll, this.maxScroll);
    for (const l of body.slice(this.scroll, this.scroll + BODY_HEIGHT)) {
      lines.push(row("  " + t.fg("text", l)));
    }
    // Pad so the box keeps a consistent, tall size even for short files
    for (let i = Math.min(body.length, BODY_HEIGHT); i < BODY_HEIGHT; i++) {
      lines.push(row(""));
    }
    if (this.maxScroll > 0) {
      const end = Math.min(body.length, this.scroll + BODY_HEIGHT);
      lines.push(row("  " + t.fg("dim", `── lines ${this.scroll + 1}-${end} of ${body.length} ──`)));
    }
    lines.push(row(""));

    // Options (horizontal)
    const opts = OPTIONS.map((o, i) =>
      i === this.selected ? t.fg("accent", `▶ ${o}`) : t.fg("text", `  ${o}`),
    ).join("    ");
    lines.push(row("  " + opts));

    // Help
    lines.push(row(""));
    const help = this.maxScroll > 0
      ? "←→ choose • ↑↓/pgup/pgdn scroll • enter • esc cancel"
      : "←→ choose • enter • esc cancel";
    lines.push(row("  " + t.fg("dim", help)));
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

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (event, ctx) => {
    if (event.reason !== "startup" || !ctx.hasUI) return;

    const content = existsSync(SYSTEM_MD) ? readFileSync(SYSTEM_MD, "utf8") : "";

    const result = await ctx.ui.custom<WelcomeResult>(
      (_tui, theme, _kb, done) => {
        const dialog = new WelcomeDialog(theme, content, done);
        dialog.focused = true;
        return dialog;
      },
      { overlay: true, overlayOptions: { width: "90%", minWidth: 60, maxHeight: "95%" } },
    );

    if (result !== "accept") ctx.shutdown();
  });
}
