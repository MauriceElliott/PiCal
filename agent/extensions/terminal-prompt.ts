/**
 * Terminal Prompt Footer + Editor
 *
 * Footer (1 line):
 *   π ~/r/project > claude-sonnet-4.6 - medium >  ⑂ main *2          ◆ 215/300  72%  ↺ May 1
 *
 * Editor (no box, ↪ prefix):
 *   ↪ this is my prompt.
 *
 * Placement: ~/.pi/agent/extensions/terminal-prompt.ts
 */

import { CustomEditor, type ExtensionAPI, type Theme } from "@mariozechner/pi-coding-agent";
import { visibleWidth } from "@mariozechner/pi-tui";
import type { EditorTheme, TUI } from "@mariozechner/pi-tui";
import type { KeybindingsManager } from "@mariozechner/pi-coding-agent";
import { join } from "path";
import {
  abbreviatePath,
  formatShortDate,
  readJsonConfig,
  watchJsonConfig,
  stripAnsi,
  thinkingLevelToColor,
  layoutLeftRight,
} from "../lib";
import { execGit, execGh } from "../lib";

// ─── Types ────────────────────────────────────────────────────────────────────

interface QuotaSnapshot {
  remaining: number;
  entitlement: number;
  percent_remaining: number;
  unlimited: boolean;
}

interface CopilotUserData {
  quota_reset_date_utc: string;
  quota_snapshots: { premium_interactions: QuotaSnapshot };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PROMPT_GLYPH = "↪ "; // 2 visual columns
const PROMPT_WIDTH = 2;

// ─── Custom Editor ────────────────────────────────────────────────────────────

class TerminalPromptEditor extends CustomEditor {
  private getTheme: () => Theme;

  constructor(
    tui: TUI,
    editorTheme: EditorTheme,
    keybindings: KeybindingsManager,
    getTheme: () => Theme
  ) {
    // paddingX: 0 — no side padding, we handle prefix ourselves
    super(tui, editorTheme, keybindings, { paddingX: 0 });
    this.getTheme = getTheme;
  }

  render(width: number): string[] {
    // Render at reduced width so our prefix fits exactly
    const raw = super.render(width - PROMPT_WIDTH);

    // raw structure (from Editor source):
    //   [0]           top border  (─────... or scroll indicator)
    //   [1 .. n-1]    content lines
    //   [n]           bottom border (─────... or scroll indicator)
    //   [n+1 ...]     autocomplete lines (optional)
    //
    // Detect bottom border: scan back for first line whose stripped text starts with ─
    let bottomIdx = raw.length - 1;
    for (let i = raw.length - 1; i >= 1; i--) {
      if (stripAnsi(raw[i]!).startsWith("─")) {
        bottomIdx = i;
        break;
      }
    }

    const theme = this.getTheme();
    const promptStr = theme.fg("accent", PROMPT_GLYPH);
    const indent = " ".repeat(PROMPT_WIDTH);

    const result: string[] = [];

    // Content lines (skip top border, skip bottom border)
    const contentLines = raw.slice(1, bottomIdx);
    for (let i = 0; i < contentLines.length; i++) {
      result.push((i === 0 ? promptStr : indent) + contentLines[i]!);
    }

    // Autocomplete lines — keep them, shifted right by PROMPT_WIDTH
    for (const line of raw.slice(bottomIdx + 1)) {
      result.push(indent + line);
    }

    return result;
  }
}

// ─── Extension ────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  let quotaData: CopilotUserData | null = null;
  let gitDirtyCount = 0;
  let gitBranch: string | null = null;
  let tuiRef: { requestRender(): void } | null = null;
  let cwdCache = "";

  // Load activeGhHost from settings.json (migrates legacy ghTenant field)
  const settingsPath = join(process.env.HOME || "", ".pi/agent/settings.json");
  const settings = readJsonConfig<Record<string, unknown>>(settingsPath, {});

  async function fetchGitBranch(): Promise<void> {
    try {
      gitBranch = await execGit(pi, ["rev-parse", "--abbrev-ref", "HEAD"]);
    } catch {
      gitBranch = null;
    }
  }

  async function fetchGitDirty(): Promise<void> {
    try {
      const output = await execGit(pi, ["status", "--porcelain"]);
      gitDirtyCount = output.split("\n").filter(Boolean).length;
    } catch {
      gitDirtyCount = 0;
    }
  }

  async function refreshAll(): Promise<void> {
    await Promise.all([fetchGitDirty(), fetchGitBranch()]);
    tuiRef?.requestRender();
  }

  function buildStatusLine(
    width: number,
    theme: Theme,
    branch: string | null,
    model: { id: string } | null | undefined
  ): string {
    const level = pi.getThinkingLevel();
    const sep = theme.fg("muted", " > ");

    // ── left ──
    const piGlyph = theme.fg("accent", "π");
    const cwd = theme.fg("dim", ` ${abbreviatePath(cwdCache)}`);
    const modelId = theme.fg("text", model?.id ?? "no model");
    const dash = theme.fg("dim", " - ");
    const levelStr = theme.fg(thinkingLevelToColor(level), level);

    let left = piGlyph + cwd + sep + modelId + dash + levelStr + theme.fg("dim", " ");

    if (branch) {
      const branchStr = theme.fg("accent", `⑂ ${branch}`);
      const dirty =
        gitDirtyCount > 0 ? theme.fg("warning", ` *${gitDirtyCount}`) : "";
      left += sep + branchStr + dirty;
    }

    // ── right ──
    let right = "";
    if (quotaData) {
      const snap = quotaData.quota_snapshots.premium_interactions;
      if (!snap.unlimited) {
        const pct = snap.percent_remaining;
        const countColor =
          pct > 50 ? "success" : pct > 25 ? "warning" : "error";
        right =
          theme.fg("dim", "◆ ") +
          theme.fg(countColor, `${snap.remaining}/${snap.entitlement}`) +
          theme.fg("dim", `  ${Math.round(pct)}%`) +
          theme.fg("dim", `  ↺ ${formatShortDate(quotaData.quota_reset_date_utc)}`);
      }
    }

    return layoutLeftRight(left, right, width);
  }

  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI) return;

    cwdCache = ctx.cwd;
    await refreshAll();

    // ── Status bar: above the editor ──
    ctx.ui.setWidget("terminal-status", (tui, theme) => {
      tuiRef = tui;
      return {
        invalidate() {},
        render(width: number): string[] {
          return [buildStatusLine(width, theme, gitBranch, ctx.model)];
        },
      };
    }, { placement: "aboveEditor" });

    // ── Footer: blank (clears the default status bar) ──
    ctx.ui.setFooter((_tui, _theme, _footerData) => ({
      invalidate() {},
      render(_width: number): string[] { return []; },
    }));

    // ── Editor: borderless with ↪ prefix ──
    ctx.ui.setEditorComponent((tui, editorTheme, kb) => {
      return new TerminalPromptEditor(tui, editorTheme, kb, () => ctx.ui.theme);
    });
  });

  pi.on("model_select", () => {
    tuiRef?.requestRender();
  });

  pi.on("agent_end", async () => {
    await refreshAll();
  });
}
