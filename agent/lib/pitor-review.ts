/**
 * PiTor reviewers: PiTan and PiLing
 *
 * Read-only child sessions made with pi's SDK. No extensions, no context files,
 * tools limited to read/grep/find/ls. Prompt is agent/SYSTEM.md plus the
 * reviewer's overlay (agent/modes/pitan.md or piling.md).
 *
 *   PiTan   seeded once per review phase with the author's transcript, kept
 *           across its re-runs (in memory; a reload re-seeds it).
 *   PiLing  fresh on every run: feature, criteria, design, plan, diff.
 *
 * Each run ends with a line `Verdict: PASS` or `Verdict: FINDINGS`. A missing
 * verdict is treated as FINDINGS.
 */

import {
  type AgentSession,
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PitorState } from "./pitor-state";

export type Reviewer = "PiTan" | "PiLing";
export type Verdict = "PASS" | "FINDINGS";

export interface ReviewResult {
  reviewer: Reviewer;
  verdict: Verdict;
  /** True when no verdict line was found and FINDINGS was assumed. */
  verdictMissing: boolean;
  text: string;
  model: string;
  usage: { input: number; output: number; cost: number };
}

/** git's empty tree, used as the base in a repository that had no commits. */
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const MAX_DIFF_CHARS = 150_000;
const REVIEW_TOOLS = ["read", "grep", "find", "ls"];

function git(cwd: string, args: string[]): string {
  return execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** The change under review: base to working tree, plus untracked files. */
export function collectChange(cwd: string, baseSha: string | null | undefined): string {
  const base = baseSha || EMPTY_TREE;
  let diff = git(cwd, ["diff", base]);
  let note = "";
  if (diff.length > MAX_DIFF_CHARS) {
    diff = diff.slice(0, MAX_DIFF_CHARS);
    note = `\n[diff truncated at ${MAX_DIFF_CHARS} characters; read the files for the rest]\n`;
  }
  const stat = git(cwd, ["diff", "--stat", base]).trim();
  const untracked = git(cwd, ["ls-files", "--others", "--exclude-standard"]).trim();
  return [
    `Base: ${baseSha ?? "(empty repository)"}`,
    "",
    "Summary:",
    stat || "(no changes)",
    "",
    "Untracked files (not in the diff; read them):",
    untracked || "(none)",
    "",
    "Diff:",
    "```diff",
    diff.trimEnd(),
    "```",
    note,
  ].join("\n");
}

export function parseVerdict(text: string): { verdict: Verdict; missing: boolean } {
  const all = [...text.matchAll(/Verdict:\s*\**\s*(PASS|FINDINGS)\b/gi)];
  const last = all[all.length - 1];
  if (!last) return { verdict: "FINDINGS", missing: true };
  return { verdict: last[1]!.toUpperCase() as Verdict, missing: false };
}

/**
 * The author's transcript, safe to replay: drops assistant messages whose tool
 * calls have no result (the in-flight pitor_review call is one), which
 * providers reject.
 */
export function seedEntries(header: unknown, branch: readonly any[]): any[] {
  const answered = new Set<string>();
  for (const e of branch) {
    if (e?.type === "message" && e.message?.role === "toolResult") answered.add(e.message.toolCallId);
  }
  const kept = branch.filter((e) => {
    if (e?.type !== "message" || e.message?.role !== "assistant") return true;
    const calls = (e.message.content ?? []).filter((b: any) => b?.type === "toolCall");
    return calls.every((b: any) => answered.has(b.id));
  });
  return header ? [header, ...kept] : kept;
}

function reviewerPrompt(agentDir: string, reviewer: Reviewer): string {
  const base = readFileSync(join(agentDir, "SYSTEM.md"), "utf8").trim();
  const overlay = readFileSync(join(agentDir, "modes", reviewer === "PiTan" ? "pitan.md" : "piling.md"), "utf8").trim();
  return `${base}\n\n---\n\n${overlay}`;
}

export interface SpawnOptions {
  reviewer: Reviewer;
  cwd: string;
  model: any; // Model from ctx.modelRegistry
  /** PiTan only: entries to seed with on first run. */
  seed?: any[];
  /** PiTan only: an existing session to reuse. */
  existing?: AgentSession;
  task: string;
  signal?: AbortSignal;
  agentDir?: string;
}

export async function runReviewer(o: SpawnOptions): Promise<{ result: ReviewResult; session: AgentSession }> {
  const agentDir = o.agentDir ?? getAgentDir();
  let session = o.existing;
  if (!session) {
    const loader = new DefaultResourceLoader({
      cwd: o.cwd,
      agentDir,
      noExtensions: true,
      noContextFiles: true,
      noSkills: true,
      noPromptTemplates: true,
      systemPromptOverride: () => reviewerPrompt(agentDir, o.reviewer),
      appendSystemPromptOverride: () => [],
    });
    await loader.reload();
    ({ session } = await createAgentSession({
      cwd: o.cwd,
      model: o.model,
      thinkingLevel: "high",
      settingsManager: SettingsManager.inMemory({ compaction: { enabled: false } }),
      resourceLoader: loader,
      tools: REVIEW_TOOLS,
      sessionManager: SessionManager.inMemory(o.cwd, undefined, o.seed),
    }));
  }

  const before = session.messages.length;
  const onAbort = () => void session!.abort();
  o.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    await session.prompt(o.task);
  } finally {
    o.signal?.removeEventListener("abort", onAbort);
  }

  const added = session.messages.slice(before).filter((m: any) => m.role === "assistant") as any[];
  const usage = added.reduce(
    (u, m) => ({
      input: u.input + (m.usage?.input ?? 0),
      output: u.output + (m.usage?.output ?? 0),
      cost: u.cost + (m.usage?.cost?.total ?? 0),
    }),
    { input: 0, output: 0, cost: 0 },
  );
  const last = added[added.length - 1];
  if (last?.stopReason === "error") throw new Error(`${o.reviewer} failed: ${last.errorMessage ?? "model error"}`);
  if (last?.stopReason === "aborted") throw new Error(`${o.reviewer} was aborted`);
  const text = session.getLastAssistantText() ?? "";
  const { verdict, missing } = parseVerdict(text);
  return {
    session,
    result: {
      reviewer: o.reviewer,
      verdict,
      verdictMissing: missing,
      text,
      model: `${o.model.provider}/${o.model.id}`,
      usage,
    },
  };
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

const VERDICT_RULE =
  "End with exactly one line: `Verdict: PASS` if there is nothing that must change, or `Verdict: FINDINGS` if there is.";

/**
 * PiTan's task. The first run restates the feature, criteria, design and plan:
 * they came from intake dialogs and the author's system prompt, neither of
 * which is in the transcript PiTan is seeded with.
 */
export function pitanTask(s: PitorState, change: string, rerun: boolean): string {
  if (rerun) {
    return [
      "The author has addressed your previous findings. Review the change again as it is now.",
      "",
      change,
      "",
      VERDICT_RULE,
    ].join("\n");
  }
  return [
    "Review the change the author has made. The conversation above is the author's session.",
    "The run's agreed terms, which you will not find in that conversation:",
    "",
    "## Feature",
    s.feature ?? "",
    "",
    "## Acceptance criteria",
    s.criteria ?? "",
    "",
    "## Approved design",
    s.design ?? "",
    "",
    "## Approved plan",
    s.plan ?? "",
    "",
    "## Change",
    change,
    "",
    VERDICT_RULE,
  ].join("\n");
}

export function pilingTask(s: PitorState, change: string): string {
  return [
    "Review this change. You have not seen how it was made.",
    "",
    "## Feature",
    s.feature ?? "",
    "",
    "## Acceptance criteria",
    s.criteria ?? "",
    "",
    "## Design",
    s.design ?? "",
    "",
    "## Plan",
    s.plan ?? "",
    "",
    "## Change",
    change,
    "",
    VERDICT_RULE,
  ].join("\n");
}
