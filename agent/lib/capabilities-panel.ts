/**
 * Capabilities panel
 *
 * Startup overview: what the configured modes can do, and the commands that
 * change them. Informational only — not a gate, not a menu. Any key dismisses.
 *
 * Component, not an extension: extensions/modes.ts owns the startup sequence
 * (panel, then the PiNa question) so the order cannot depend on extension load
 * order.
 *
 * Content comes from lib/modes-registry, the same registry that drives prompt
 * composition, so the panel cannot drift from what the agent can do.
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import { type Focusable, visibleWidth, wrapTextWithAnsi } from "@mariozechner/pi-tui";
import { MODES, type ModeState } from "./modes-registry";

const COMMANDS: readonly (readonly [string, string])[] = [
  ["/mode [pical|pitor|pivez]", "switch mode (starts a new session)"],
  ["/pina [on|off]", "toggle the Socratic overlay"],
  ["/new", "fresh context, defaults restored"],
];

export class CapabilitiesPanel implements Focusable {
  focused = false;

  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(
    private theme: Theme,
    private state: ModeState,
    private done: () => void,
  ) {}

  private readonly openedAt = Date.now();

  /**
   * Any key dismisses. No accept, no cancel, no decision.
   *
   * At launch the terminal is still delivering startup traffic (capability and
   * colour query replies, buffered keystrokes) into the input stream. Those
   * would dismiss the panel before it is ever drawn, so input is ignored for a
   * short grace period, and terminal replies / key-release events are ignored.
   */
  handleInput(data?: string): void {
    if (Date.now() - this.openedAt < 600) return;
    if (data && (/^\x1b\[[?>=]/.test(data) || /^\x1b\][\s\S]*(\x07|\x1b\\)$/.test(data) || /:3[u~A-D]$/.test(data))) return;
    this.done();
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;

    const t = this.theme;
    const innerW = width - 2;
    const pad = (s: string) => s + " ".repeat(Math.max(0, innerW - visibleWidth(s)));
    const row = (c: string) => t.fg("border", "│") + pad(c) + t.fg("border", "│");

    const lines: string[] = [];

    const title = " PiCal — capabilities ";
    const bl = Math.max(0, Math.floor((innerW - title.length) / 2));
    const br = Math.max(0, innerW - bl - title.length);
    lines.push(
      t.fg("border", "╭" + "─".repeat(bl)) + t.fg("accent", title) + t.fg("border", "─".repeat(br) + "╮"),
    );
    lines.push(row(""));

    for (const m of MODES) {
      const active = m.id === this.state.mode;
      let tag = "";
      if (m.status === "not-implemented") tag = "  ·  not implemented";
      else if (active) tag = this.state.pina ? "  ·  active + PiNa" : "  ·  active";

      lines.push(row("  " + t.fg(active ? "accent" : "text", m.label) + t.fg("dim", tag)));
      for (const wrapped of wrapTextWithAnsi(m.summary, innerW - 6)) {
        lines.push(row("    " + t.fg("dim", wrapped)));
      }
      for (const cap of m.capabilities) {
        for (const wrapped of wrapTextWithAnsi(cap, innerW - 8)) {
          lines.push(row("      " + t.fg("text", wrapped)));
        }
      }
      lines.push(row(""));
    }

    lines.push(row("  " + t.fg("accent", "Commands")));
    const labelW = Math.min(31, Math.max(...COMMANDS.map(([c]) => c.length)) + 3);
    for (const [cmd, desc] of COMMANDS) {
      const inline = 4 + labelW + desc.length <= innerW;
      if (inline) {
        lines.push(row("    " + t.fg("text", cmd.padEnd(labelW)) + t.fg("dim", desc)));
      } else {
        lines.push(row("    " + t.fg("text", cmd)));
        for (const wrapped of wrapTextWithAnsi(desc, innerW - 8)) {
          lines.push(row("      " + t.fg("dim", wrapped)));
        }
      }
    }

    lines.push(row(""));
    lines.push(row("  " + t.fg("dim", "press any key")));
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
