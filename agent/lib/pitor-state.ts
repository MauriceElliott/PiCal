/**
 * PiTor run state
 *
 * Single source for the PiTor flow. Imported by:
 *   - extensions/modes.ts           (intake on entering PiTor, prompt section, tool filtering)
 *   - extensions/pitor.ts           (the flow tools)
 *   - extensions/terminal-prompt.ts (phase on the status line)
 *
 * State lives in the session branch as "pitor" custom entries, each a partial
 * update; the last write of each field wins. No module-level state, so every
 * extension reads the same thing.
 */

export const PITOR_KEY = "pitor";

export type Phase = "design" | "plan" | "implement" | "validate" | "review" | "present";

export interface PitorState {
  /** undefined until intake has completed for this session. */
  phase?: Phase;
  feature?: string;
  criteria?: string;
  authorModel?: string;
  reviewerModel?: string;
  /** Commit the run started from, or null in a repository with no commits. */
  baseSha?: string | null;
  baseBranch?: string | null;
  branch?: string;
  design?: string;
  plan?: string;
  /** Findings returned to the author so far. Three allowed; the next result goes to the operator. */
  fixPasses: number;
  pitanPassed: boolean;
  /** Set when the review cap was reached. */
  capReached?: boolean;
}

export const MAX_FIX_PASSES = 3;

/** Tools registered by extensions/pitor.ts. Hidden outside PiTor. */
export const PITOR_TOOLS: ReadonlySet<string> = new Set([
  "pitor_approve",
  "pitor_implementation_done",
  "pitor_validation_done",
  "pitor_review",
  "pitor_hand_back",
]);

export const NEXT_PHASE: Record<Phase, Phase | undefined> = {
  design: "plan",
  plan: "implement",
  implement: "validate",
  validate: "review",
  review: "present",
  present: undefined,
};

export function readPitorState(
  entries: readonly { type: string; customType?: string; data?: unknown }[],
): PitorState {
  const state: PitorState = { fixPasses: 0, pitanPassed: false };
  for (const entry of entries) {
    if (entry.type !== "custom" || entry.customType !== PITOR_KEY) continue;
    if (entry.data && typeof entry.data === "object") Object.assign(state, entry.data);
  }
  return state;
}

// ── Vendor family ─────────────────────────────────────────────────────────────

const FAMILIES: readonly [RegExp, string][] = [
  [/claude|anthropic/i, "anthropic"],
  [/\bgpt|codex|\bo[1-9]\b|openai|chatgpt/i, "openai"],
  [/gemini|gemma|google/i, "google"],
  [/deepseek/i, "deepseek"],
  [/glm|zhipu|z-ai/i, "zhipu"],
  [/kimi|moonshot/i, "moonshot"],
  [/grok|xai/i, "xai"],
  [/mistral|codestral|devstral/i, "mistral"],
  [/llama|meta/i, "meta"],
  [/qwen|alibaba/i, "alibaba"],
];

/** Vendor family from a model id (and provider), or undefined if unknown. */
export function modelFamily(id: string, provider = ""): string | undefined {
  for (const [re, family] of FAMILIES) if (re.test(id)) return family;
  // Providers that only serve their own models.
  for (const [re, family] of FAMILIES) if (re.test(provider)) return family;
  return undefined;
}

// ── Prompt section ────────────────────────────────────────────────────────────

const INSTRUCTIONS: Record<Phase, string> = {
  design:
    "Discuss the design with the operator: the route, what it should look like, how the code should be structured. " +
    "Do not write code or create the branch. When the operator agrees, call `pitor_approve` with phase `design` and the full design " +
    "document (overview plus a decision record: choice, rejected alternatives, reason, cost of reversal).",
  plan:
    "Write the plan: the steps, and an estimate of files and size. Do not write code yet. Iterate with the operator, then call " +
    "`pitor_approve` with phase `plan` and the full plan.",
  implement:
    "Implement the approved plan in one go. First create the branch: `git switch -c agent/_ag__br_<short-feature-name>`. " +
    "Commit there as you go. Never push. When done, call `pitor_implementation_done`. " +
    "If it is not working, stop and call `pitor_hand_back` with the reason; do not keep trying.",
  validate:
    "Validate locally. Use the commands in `.pical/instructions.md` at the repository root if it exists; otherwise choose them " +
    "and say they were your choice. Run them, then call `pitor_validation_done` with each command, its exit code, and the result.",
  review:
    "Call `pitor_review`. It runs PiTan, then PiLing. If it returns findings, fix them, commit, and call `pitor_review` again. " +
    "Do not argue with a finding in place of fixing it; if you think a finding is wrong, say so in the commit message and the presentation.",
  present:
    "Present the result to the operator: what changed, the decisions behind it, the design overview, and the areas you are least " +
    "sure of. For each, give a line the operator can run, `hx path:line`. State what validation ran and its result. " +
    "Do not merge; the operator merges the branch.",
};

export function pitorPromptSection(s: PitorState): string {
  if (!s.phase) {
    return [
      "## PiTor run",
      "",
      "Intake has not completed. Do not start work. Tell the operator to run `/pitor` to start the intake.",
    ].join("\n");
  }
  const lines = [
    "## PiTor run",
    "",
    `Phase: **${s.phase}**`,
    `Author model: ${s.authorModel ?? "unknown"}. Reviewer model: ${s.reviewerModel ?? "unknown"}.`,
    s.branch ? `Branch: ${s.branch}` : "",
    s.phase === "review" || s.phase === "present"
      ? `Review: ${s.fixPasses} of ${MAX_FIX_PASSES} fix passes used${s.capReached ? " (cap reached)" : ""}.`
      : "",
    "",
    "### Feature",
    s.feature ?? "",
    "",
    "### Acceptance criteria",
    s.criteria ?? "",
  ];
  if (s.design) lines.push("", "### Approved design", s.design);
  if (s.plan) lines.push("", "### Approved plan", s.plan);
  lines.push("", "### What to do now", INSTRUCTIONS[s.phase]);
  return lines.filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n");
}
