/**
 * Approval Gate Extension
 *
 * Intercepts mutating tool calls (write, edit, non-read-only bash) and
 * presents an approval dialog.
 *
 * edit / write  → compact right-anchored overlay: Accept | Cancel
 * bash          → full centre overlay: Yes | Yes, and... | No, and...
 *
 * Read-only tools (read, ls, grep, find) and read-only bash commands
 * pass through without prompting.
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

// ── Read-only classification ──────────────────────────────────────────────────

const SAFE_COMMANDS = new Set([
  // File reading
  "cat", "head", "tail", "less", "more", "bat", "tac",
  // Listing / finding
  "ls", "tree", "find", "locate", "fd", "cd",
  // Search
  "grep", "egrep", "fgrep", "rg", "ag", "ack",
  // File info
  "file", "stat", "wc", "du", "df", "md5sum", "sha256sum", "sha1sum",
  // Text processing (stdout-only)
  "sort", "uniq", "cut", "tr", "awk", "sed", "jq", "yq", "column", "fmt", "fold", "nl", "rev",
  // Path utilities
  "which", "whereis", "type", "command", "realpath", "readlink", "basename", "dirname",
  // System info
  "echo", "printf", "pwd", "date", "cal", "whoami", "id", "hostname", "uname", "uptime",
  "env", "printenv", "ps", "free", "lsof",
  // Comparison
  "diff", "cmp", "comm",
  // Test
  "test", "[", "[[", "true", "false",
  // Network (read)
  "dig", "host", "nslookup", "ping",
]);

const SAFE_GIT_SUBCOMMANDS = new Set([
  "status", "log", "diff", "show", "branch", "tag", "remote",
  "describe", "rev-parse", "ls-files", "blame", "shortlog", "reflog",
]);

function firstWord(segment: string): string {
  const parts = segment.split(/\s+/);
  for (const p of parts) {
    if (p.includes("=") && !p.startsWith("-")) continue; // skip FOO=bar
    return p.split("/").pop() || p; // handle /usr/bin/cat → cat
  }
  return parts[0]?.split("/").pop() || "";
}

function secondWord(segment: string): string | undefined {
  const parts = segment.split(/\s+/).filter((p) => !p.includes("=") || p.startsWith("-"));
  return parts[1];
}

function isReadOnlyBash(command: string): boolean {
  // Any file redirect → mutating
  if (command.includes(">")) return false;
  // sed -i → mutating
  if (/\bsed\b.*\s-i\b/.test(command)) return false;

  const segments = command
    .split(/\s*(?:&&|\|\||[;\n|])\s*/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const seg of segments) {
    const cmd = firstWord(seg);
    if (!cmd) continue;

    if (cmd === "git") {
      const sub = secondWord(seg);
      if (!sub || !SAFE_GIT_SUBCOMMANDS.has(sub)) return false;
      continue;
    }

    if (!SAFE_COMMANDS.has(cmd)) return false;
  }

  return true;
}

// ── Simple approval dialog (edit / write) ───────────────────────────────────

const SIMPLE_OPTIONS = ["Accept", "Cancel"] as const;

class SimpleApprovalDialog implements Focusable {
  focused = false;

  private selected = 0;
  private description: string;
  private theme: Theme;
  private done: (r: ApprovalResult) => void;
  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(theme: Theme, description: string, done: (r: ApprovalResult) => void) {
    this.theme = theme;
    this.description = description;
    this.done = done;
  }

  handleInput(data: string): void {
    if (matchesKey(data, "up") && this.selected > 0) {
      this.selected--;
    } else if (matchesKey(data, "down") && this.selected < 1) {
      this.selected++;
    } else if (matchesKey(data, "return")) {
      this.done(this.selected === 0 ? { action: "approve" } : { action: "cancel" });
      return;
    } else if (matchesKey(data, "escape")) {
      this.done({ action: "cancel" });
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

    const pad = (s: string, len: number) => {
      const vis = visibleWidth(s);
      return s + " ".repeat(Math.max(0, len - vis));
    };
    const row = (content: string) => t.fg("border", "│") + pad(content, innerW) + t.fg("border", "│");

    // Top border
    const title = " Approval ";
    const borderLeft = Math.max(0, Math.floor((innerW - title.length) / 2));
    const borderRight = Math.max(0, innerW - borderLeft - title.length);
    lines.push(
      t.fg("border", "╭") +
        t.fg("border", "─".repeat(borderLeft)) +
        t.fg("accent", title) +
        t.fg("border", "─".repeat(borderRight)) +
        t.fg("border", "╮"),
    );

    // Description
    const descTruncated =
      this.description.length > innerW - 4
        ? this.description.slice(0, innerW - 7) + "..."
        : this.description;
    lines.push(row(""));
    lines.push(row("  " + t.fg("toolTitle", descTruncated)));
    lines.push(row(""));

    // Options
    for (let i = 0; i < SIMPLE_OPTIONS.length; i++) {
      const isSel = i === this.selected;
      const prefix = isSel ? t.fg("accent", "  ▶ ") : "    ";
      const label = isSel ? t.fg("accent", SIMPLE_OPTIONS[i]) : t.fg("text", SIMPLE_OPTIONS[i]);
      lines.push(row(prefix + label));
    }

    // Help
    lines.push(row(""));
    lines.push(row("  " + t.fg("dim", "↑↓ navigate  •  enter  •  esc cancel")));

    // Bottom border
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

// ── System prompt snippet ─────────────────────────────────────────────────────

const GATE_PROMPT = `
## Approval Gate (Active)

Mutating tool calls (write, edit, non-read-only bash) require user approval before execution.
The approval gate handles confirmation automatically — do not ask "should I proceed?" in your
messages. Just make the tool call and the user will approve, reject, or redirect via the gate.

If a tool call is rejected with instructions, follow the user's alternative direction.
If a tool call is approved with additional instructions, execute the tool and then follow those
instructions afterward.
`.trim();

// ── Extension ─────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  // ── Gate mutating tool calls ──

  pi.on("tool_call", async (event, ctx) => {
    // Always allow read-only tools
    if (["read", "ls", "grep", "find"].includes(event.toolName)) return undefined;

    // Allow read-only bash
    if (event.toolName === "bash") {
      const cmd = (event.input as { command?: string }).command ?? "";
      if (isReadOnlyBash(cmd)) return undefined;
    }

    // Non-interactive mode: block by default
    if (!ctx.hasUI) {
      return { block: true, reason: "Mutating tool call blocked (no UI for approval)" };
    }

    // Build description
    const desc = describeToolCall(event.toolName, event.input as Record<string, unknown>);

    // edit / write → compact right-anchored dialog
    if (event.toolName === "edit" || event.toolName === "write") {
      const result = await ctx.ui.custom<ApprovalResult>(
        (_tui, theme, _kb, done) => {
          const dialog = new SimpleApprovalDialog(theme, desc, done);
          dialog.focused = true;
          return dialog;
        },
        {
          overlay: true,
          overlayOptions: () => ({
            anchor: "bottom-right",
            width: 42,
            margin: 2,
          }),
        },
      );

      if (!result || result.action === "cancel") {
        return { block: true, reason: "Blocked by user" };
      }
      return undefined;
    }

    // bash (and any other mutating tools) → full centre dialog
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

    if (result.action === "approve") {
      return undefined;
    }

    if (result.action === "approve_instruct") {
      pi.sendUserMessage(result.instruction, { deliverAs: "steer" });
      return undefined;
    }

    if (result.action === "reject_instruct") {
      pi.sendUserMessage(result.instruction, { deliverAs: "steer" });
      return { block: true, reason: "Rejected by user" };
    }

    return undefined;
  });

  // ── Inject gate instructions into system prompt ──

  pi.on("before_agent_start", async (event, _ctx) => {
    return { systemPrompt: event.systemPrompt + "\n\n" + GATE_PROMPT };
  });
}
