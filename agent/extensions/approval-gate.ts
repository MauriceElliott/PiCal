/**
 * Approval Gate Extension
 *
 * Gates exactly three bash commands: `git add`, `git commit`, `git push`.
 * Everything else (every other tool, every other bash command) passes through
 * without a dialog. Mode-level restrictions live in extensions/modes.ts.
 *
 * Detection is token-based per command segment, so `git log --grep add` is
 * not gated and `git -C repo commit -m x` is. Shell wrappers are looked
 * through (env, sudo, xargs, `bash -c '...'`, ...). Aliases and scripts that
 * call git internally are not detected.
 */

import type { ExtensionAPI, Theme } from "@mariozechner/pi-coding-agent";
import { type Focusable, matchesKey, visibleWidth } from "@mariozechner/pi-tui";
import { TextInputComponent } from "../lib/text-input-component";

// ── Result type ───────────────────────────────────────────────────────────────

type ApprovalResult =
  | { action: "approve" }
  | { action: "approve_instruct"; instruction: string }
  | { action: "reject_instruct"; instruction: string }
  | { action: "cancel" };

// ── Git write detection ───────────────────────────────────────────────────────

const GATED_GIT = new Set(["add", "commit", "push"]);
/** Git global options that consume the following token. */
const GIT_OPTS_WITH_ARG = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path"]);
const WRAPPERS = new Set(["env", "sudo", "command", "exec", "time", "nice", "nohup", "xargs", "doas", "builtin"]);
const SHELLS = new Set(["sh", "bash", "zsh", "dash", "ksh"]);

const unquote = (t: string) => t.replace(/^['"`(]+|['"`);]+$/g, "");
const base = (t: string) => unquote(t).split("/").pop() ?? "";

/** The git subcommand if these tokens invoke git, else undefined. */
function gitSubcommand(tokens: string[]): string | undefined {
  let i = 0;
  while (i < tokens.length) {
    const t = unquote(tokens[i]!);
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(t) || WRAPPERS.has(base(t)) || (t.startsWith("-") && i > 0)) i++;
    else break;
  }
  if (base(tokens[i] ?? "") !== "git") return undefined;
  for (i++; i < tokens.length; i++) {
    const t = unquote(tokens[i]!);
    if (GIT_OPTS_WITH_ARG.has(t)) {
      i++;
      continue;
    }
    if (t.startsWith("-")) continue; // --no-pager, --git-dir=x, -P ...
    return t;
  }
  return undefined;
}

export function isGatedGit(command: string): boolean {
  const segments = command
    .split(/&&|\|\||[;\n|&]|\$\(|`/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const seg of segments) {
    const tokens = seg.split(/\s+/);
    // Direct invocation.
    const direct = gitSubcommand(tokens);
    if (direct && GATED_GIT.has(direct)) return true;

    // `bash -c "git commit ..."`: re-scan what follows -c.
    const first = tokens.findIndex((t) => SHELLS.has(base(t)));
    const c = tokens.indexOf("-c", first + 1);
    if (first >= 0 && c > first) {
      const inner = tokens.slice(c + 1).join(" ");
      if (isGatedGit(unquote(inner))) return true;
    }
  }
  return false;
}

// ── Tool call description ─────────────────────────────────────────────────────

function describeToolCall(toolName: string, input: Record<string, unknown>): string {
  if (toolName === "bash") {
    const cmd = String(input.command ?? "");
    const first = cmd.split("\n")[0]?.trim() ?? cmd;
    return `bash  ${first}`;
  }
  if (toolName === "edit") return `edit  ${input.path}`;
  if (toolName === "write") return `write  ${input.path}`;
  return `${toolName}  ${JSON.stringify(input).slice(0, 80)}`;
}

// ── Approval dialog component ─────────────────────────────────────────────────

const OPTIONS = ["Yes", "Yes, and...", "No, and..."] as const;

class ApprovalDialog implements Focusable {
  focused = false;

  private mode: "select" | "typing" = "select";
  private selected = 0;
  private textInput: TextInputComponent;
  private description: string;
  private theme: Theme;
  private done: (r: ApprovalResult) => void;

  constructor(theme: Theme, description: string, done: (r: ApprovalResult) => void) {
    this.theme = theme;
    this.description = description;
    this.done = done;
    this.textInput = new TextInputComponent(theme, {
      placeholder: "type instruction...",
      maxLines: 3,
    });
  }

  // ── Input ───────────────────────────────────────────────────────────────

  handleInput(data: string): void {
    if (this.mode === "select") {
      this.handleSelect(data);
    } else {
      this.handleTyping(data);
    }
  }

  private handleSelect(data: string): void {
    if (matchesKey(data, "up") && this.selected > 0) {
      this.selected--;
    } else if (matchesKey(data, "down") && this.selected < 2) {
      this.selected++;
    } else if (matchesKey(data, "return")) {
      if (this.selected === 0) {
        this.done({ action: "approve" });
        return;
      }
      this.mode = "typing";
      this.textInput.clear();
      this.textInput.focused = this.focused;
    } else if (matchesKey(data, "escape")) {
      this.done({ action: "cancel" });
      return;
    } else {
      return;
    }
    this.invalidate();
  }

  private handleTyping(data: string): void {
    if (matchesKey(data, "return")) {
      const instruction = this.textInput.getValue().trim();
      if (!instruction) return; // require non-empty
      if (this.selected === 1) {
        this.done({ action: "approve_instruct", instruction });
      } else {
        this.done({ action: "reject_instruct", instruction });
      }
      return;
    }
    if (matchesKey(data, "escape")) {
      this.mode = "select";
      this.textInput.clear();
      this.invalidate();
      return;
    }
    this.textInput.handleInput(data);
    this.invalidate();
  }

  // ── Render ──────────────────────────────────────────────────────────────

  private cachedWidth?: number;
  private cachedLines?: string[];

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;

    const t = this.theme;
    const innerW = width - 2;
    const lines: string[] = [];

    const pad = (s: string, len: number) => {
      const vis = visibleWidth(s);
      return s + " ".repeat(Math.max(0, len - vis));
    };
    const row = (content: string) => t.fg("border", "│") + pad(content, innerW) + t.fg("border", "│");

    // ── Top border with title ──
    const title = " Approval Required ";
    const borderLeft = Math.max(0, Math.floor((innerW - title.length) / 2));
    const borderRight = Math.max(0, innerW - borderLeft - title.length);
    lines.push(
      t.fg("border", "╭") +
        t.fg("border", "─".repeat(borderLeft)) +
        t.fg("accent", title) +
        t.fg("border", "─".repeat(borderRight)) +
        t.fg("border", "╮"),
    );

    // ── Tool description ──
    const descTruncated = this.description.length > innerW - 4
      ? this.description.slice(0, innerW - 7) + "..."
      : this.description;
    lines.push(row(""));
    lines.push(row("  " + t.fg("toolTitle", descTruncated)));
    lines.push(row(""));

    // ── Options ──
    if (this.mode === "select") {
      for (let i = 0; i < OPTIONS.length; i++) {
        const isSel = i === this.selected;
        const prefix = isSel ? t.fg("accent", "  ▶ ") : "    ";
        const label = isSel ? t.fg("accent", OPTIONS[i]) : t.fg("text", OPTIONS[i]);
        lines.push(row(prefix + label));
      }
    } else {
      for (let i = 0; i < OPTIONS.length; i++) {
        if (i === this.selected) {
          // Active input line
          const label = i === 1 ? "Yes, and " : "No, and ";
          const prefix = t.fg("accent", "  ↪ " + label);
          this.textInput.focused = this.focused;
          const inputLines = this.textInput.render(innerW - 12);
          for (let li = 0; li < inputLines.length; li++) {
            const content = (li === 0 ? prefix : "      ") + inputLines[li]!;
            lines.push(row(content));
          }
        } else {
          lines.push(row("    " + t.fg("dim", OPTIONS[i])));
        }
      }
    }

    // ── Help line ──
    lines.push(row(""));
    const help =
      this.mode === "select"
        ? "↑↓ navigate • enter select • esc block"
        : "enter confirm • esc back";
    lines.push(row("  " + t.fg("dim", help)));

    // ── Bottom border ──
    lines.push(t.fg("border", "╰" + "─".repeat(innerW) + "╯"));

    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }

  dispose(): void {
    this.textInput.dispose();
  }
}

// ── Extension ─────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return undefined;
    const cmd = (event.input as { command?: string }).command ?? "";
    if (!isGatedGit(cmd)) return undefined;

    // Non-interactive mode: block by default
    if (!ctx.hasUI) {
      return { block: true, reason: "git add/commit/push blocked (no UI for approval)" };
    }

    const desc = describeToolCall(event.toolName, event.input as Record<string, unknown>);
    const result = await ctx.ui.custom<ApprovalResult>(
      (_tui, theme, _kb, done) => {
        const dialog = new ApprovalDialog(theme, desc, done);
        dialog.focused = true;
        return dialog;
      },
      { overlay: true },
    );

    if (!result || result.action === "cancel") {
      return { block: true, reason: "Blocked by user" };
    }
    if (result.action === "approve_instruct") {
      pi.sendUserMessage(result.instruction, { deliverAs: "steer" });
    }
    if (result.action === "reject_instruct") {
      pi.sendUserMessage(result.instruction, { deliverAs: "steer" });
      return { block: true, reason: "Rejected by user" };
    }
    return undefined;
  });
}
