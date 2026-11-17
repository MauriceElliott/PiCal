/**
 * Approval Gate Extension
 *
 * Gates a small set of git commands in bash. Everything else (every other tool,
 * every other bash command) passes without a dialog. The current mode is read
 * from the session branch with readModeState, the same source modes.ts uses.
 *
 *   git add, git commit
 *       In PiCal: refused outright, no dialog, on every branch.
 *       Elsewhere: allowed when the branch they will run on starts with
 *       `agent/_ag__br_` followed by at least one character. Gated otherwise.
 *   git push, merge, cherry-pick, revert, rebase, pull
 *       Always gated, on every branch.
 *
 * The branch is read from the repository at call time and then tracked through
 * the command chain, so `git switch -c agent/_ag__br_x && git commit` is judged
 * against the new branch. A branch or directory change is only trusted for the
 * next command when the two are joined by `&&`; after `;`, `||`, `|`, `&`, a
 * newline or a substitution it is treated as unknown and add/commit are gated,
 * because the earlier command may have failed. Anything that cannot be resolved
 * (outside a repo, detached HEAD, --git-dir, GIT_DIR, unreadable path) is
 * unknown, and unknown is gated.
 *
 * Not detected: git aliases, scripts that call git internally, other-language
 * subprocesses. This guards against accidents; it is not a security boundary.
 */

import type { ExtensionAPI, Theme } from "@mariozechner/pi-coding-agent";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { type ModeId, readModeState } from "../lib/modes-registry";
import { type Focusable, matchesKey, visibleWidth } from "@mariozechner/pi-tui";
import { TextInputComponent } from "../lib/text-input-component";

// ── Result type ───────────────────────────────────────────────────────────────

type ApprovalResult =
  | { action: "approve" }
  | { action: "approve_instruct"; instruction: string }
  | { action: "reject_instruct"; instruction: string }
  | { action: "cancel" };

// ── Git write detection ───────────────────────────────────────────────────────

/** add and commit are allowed only on a branch that starts with this. */
export const AGENT_BRANCH_PREFIX = "agent/_ag__br_";
const ALWAYS_GATED = new Set(["push", "merge", "cherry-pick", "revert", "rebase", "pull"]);
const BRANCH_GATED = new Set(["add", "commit"]);
/** Git global options that consume the following token. */
const GIT_OPTS_WITH_ARG = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path"]);
const WRAPPERS = new Set(["env", "sudo", "command", "exec", "time", "nice", "nohup", "xargs", "doas", "builtin"]);
const SHELLS = new Set(["sh", "bash", "zsh", "dash", "ksh"]);

const unquote = (t: string) => t.replace(/^['"`(]+|['"`);]+$/g, "");
const base = (t: string) => unquote(t).split("/").pop() ?? "";

export function isAgentBranch(name: string | null | undefined): boolean {
  return !!name && name.startsWith(AGENT_BRANCH_PREFIX) && name.length > AGENT_BRANCH_PREFIX.length;
}

/** Current branch of the repository at `dir`, or null if it cannot be resolved. */
export function readBranch(dir: string): string | null {
  try {
    const out = execFileSync("git", ["-C", dir, "symbolic-ref", "--short", "-q", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 3000,
    }).trim();
    return out || null;
  } catch {
    return null; // not a repo, detached HEAD, git missing, timeout
  }
}

export type BranchOf = (dir: string) => string | null;
export interface Verdict {
  gated: boolean;
  /** Refuse without a dialog (PiCal never commits or stages). */
  block?: boolean;
  reason?: string;
}

interface GitCall {
  sub: string;
  args: string[];
  /** Directory the command runs in, or null if it cannot be determined. */
  dir: string | null;
}

/** Parse tokens as a git call, or undefined if they are not one. */
function parseGit(tokens: string[], cwd: string | null): GitCall | undefined {
  let i = 0;
  let dir = cwd;
  while (i < tokens.length) {
    const t = unquote(tokens[i]!);
    if (/^(GIT_DIR|GIT_WORK_TREE)=/.test(t)) {
      dir = null;
      i++;
    } else if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(t) || WRAPPERS.has(base(t)) || (t.startsWith("-") && i > 0)) i++;
    else break;
  }
  if (base(tokens[i] ?? "") !== "git") return undefined;
  for (i++; i < tokens.length; i++) {
    const t = unquote(tokens[i]!);
    if (t === "-C") {
      const next = unquote(tokens[i + 1] ?? "");
      dir = dir === null || !next || /[$~`]/.test(next) ? null : resolve(dir, next);
      i++;
      continue;
    }
    if (t === "--git-dir" || t === "--work-tree" || t.startsWith("--git-dir=") || t.startsWith("--work-tree=")) {
      dir = null;
      if (t === "--git-dir" || t === "--work-tree") i++;
      continue;
    }
    if (GIT_OPTS_WITH_ARG.has(t)) {
      i++;
      continue;
    }
    if (t.startsWith("-")) continue; // --no-pager, -P ...
    return { sub: t, args: tokens.slice(i + 1).map(unquote), dir };
  }
  return undefined;
}

/**
 * The branch a switch/checkout/branch-rename leaves the repository on:
 * a name, null if unknown, undefined if the call does not change the branch.
 */
function branchAfter(call: GitCall): string | null | undefined {
  const a = call.args;
  const flagArg = (flags: string[]): string | undefined => {
    const i = a.findIndex((x) => flags.includes(x));
    return i >= 0 ? a[i + 1] : undefined;
  };
  if (call.sub === "switch") {
    const created = flagArg(["-c", "-C", "--create", "--force-create"]);
    if (created) return created;
    if (a.includes("--detach") || a.includes("-d")) return null;
    const target = a.find((x) => !x.startsWith("-"));
    if (!target) return null;
    return target === "-" ? null : target;
  }
  if (call.sub === "checkout") {
    const created = flagArg(["-b", "-B"]);
    if (created) return created;
    if (a.includes("--detach") || a.includes("--") || a.includes("-p") || a.includes("--patch")) return null;
    const target = a.find((x) => !x.startsWith("-"));
    if (!target) return undefined; // `git checkout` alone changes nothing
    return target === "-" ? null : target;
  }
  if (call.sub === "branch") {
    const names = a.filter((x) => !x.startsWith("-"));
    if (a.some((x) => x === "-m" || x === "-M" || x === "--move")) {
      return names.length === 1 ? names[0]! : null; // two names: unknown which is current
    }
  }
  return undefined;
}

type Segment = { text: string; connector: string };

/** Split a command into segments, keeping the operator that precedes each. */
function splitSegments(command: string): Segment[] {
  const parts = command.split(/(&&|\|\||\$\(|[;\n|&`])/);
  const out: Segment[] = [];
  let connector = "";
  for (const part of parts) {
    if (part === undefined) continue;
    if (/^(&&|\|\||\$\(|[;\n|&`])$/.test(part)) {
      connector = part;
      continue;
    }
    const text = part.trim();
    if (text) out.push({ text, connector });
    connector = connector && !text ? connector : "";
  }
  return out;
}

interface Chain {
  mode: ModeId | undefined;
  cwd: string | null;
  /** Branch overrides produced earlier in this chain, keyed by directory. */
  branches: Map<string, string | null>;
  /** An earlier state change was not guaranteed to have happened. */
  uncertain: boolean;
}

function evaluate(command: string, chain: Chain, branchOf: BranchOf, verdicts: Verdict[]): void {
  const segments = splitSegments(command);
  for (let n = 0; n < segments.length; n++) {
    const seg = segments[n]!;
    const next = segments[n + 1];
    const tokens = seg.text.split(/\s+/);
    // The effect of this segment is only trusted by what follows when `&&` joins them.
    const trustedNext = !next || next.connector === "&&";
    let changedState = false;

    // `cd dir`
    if (base(tokens[0] ?? "") === "cd") {
      const target = unquote(tokens[1] ?? "");
      chain.cwd = chain.cwd === null || !target || /[$~`-]/.test(target[0] ?? "") || target === "-"
        ? null
        : resolve(chain.cwd, target);
      changedState = true;
    }

    const call = parseGit(tokens, chain.cwd);
    if (call) {
      if (ALWAYS_GATED.has(call.sub)) {
        verdicts.push({ gated: true, reason: `git ${call.sub} is gated on every branch` });
      } else if (BRANCH_GATED.has(call.sub) && chain.mode === "pical") {
        verdicts.push({ gated: true, block: true, reason: `git ${call.sub}: PiCal never commits or stages` });
      } else if (BRANCH_GATED.has(call.sub)) {
        const branch = call.dir === null || chain.uncertain
          ? null
          : chain.branches.has(call.dir)
            ? chain.branches.get(call.dir)!
            : branchOf(call.dir);
        if (isAgentBranch(branch)) verdicts.push({ gated: false });
        else {
          const why = chain.uncertain
            ? "an earlier cd or branch change in this command may not have happened"
            : branch
              ? `branch "${branch}" does not start with ${AGENT_BRANCH_PREFIX}`
              : "the branch could not be determined";
          verdicts.push({ gated: true, reason: `git ${call.sub}: ${why}` });
        }
      } else {
        const after = branchAfter(call);
        if (after !== undefined) {
          if (call.dir === null) chain.uncertain = true;
          else chain.branches.set(call.dir, after);
          changedState = true;
        }
      }
    }

    // `bash -c "git commit ..."`: judge the inner command in a copy of the state.
    const first = tokens.findIndex((t) => SHELLS.has(base(t)));
    const c = tokens.indexOf("-c", first + 1);
    if (first >= 0 && c > first) {
      const inner = unquote(tokens.slice(c + 1).join(" "));
      evaluate(inner, { mode: chain.mode, cwd: chain.cwd, branches: new Map(chain.branches), uncertain: chain.uncertain }, branchOf, verdicts);
    }

    if (changedState && !trustedNext) chain.uncertain = true;
  }
}

/** Judge a bash command. One verdict per git call that is subject to the gate. */
export function judgeBash(
  command: string,
  cwd: string,
  branchOf: BranchOf = readBranch,
  mode?: ModeId,
): Verdict[] {
  const verdicts: Verdict[] = [];
  evaluate(command, { mode, cwd, branches: new Map(), uncertain: false }, branchOf, verdicts);
  return verdicts;
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
    const mode = readModeState(ctx.sessionManager.getBranch()).mode;
    const verdicts = judgeBash(cmd, ctx.cwd, readBranch, mode);
    const refused = verdicts.find((v) => v.block);
    if (refused) return { block: true, reason: refused.reason };
    const gated = verdicts.filter((v) => v.gated);
    if (gated.length === 0) return undefined;
    const reason = gated.map((v) => v.reason).join("; ");

    // Non-interactive mode: block by default
    if (!ctx.hasUI) {
      return { block: true, reason: `Blocked (no UI for approval): ${reason}` };
    }

    const desc = `${describeToolCall(event.toolName, event.input as Record<string, unknown>)}  [${reason}]`;
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
