/**
 * PiTor
 *
 * The flow tools. Active only in PiTor (extensions/modes.ts filters them out
 * elsewhere). State lives in "pitor" session entries (lib/pitor-state.ts);
 * the prompt section that tells the model which phase it is in is composed by
 * extensions/modes.ts. Intake is lib/pitor-intake.ts.
 *
 *   pitor_approve              design or plan done -> operator approves or asks for changes
 *   pitor_implementation_done  implement -> validate (checks the agent branch)
 *   pitor_validation_done      validate -> review, or back to the operator on failure
 *   pitor_review               runs PiTan, then PiLing; enforces the three-pass cap
 *   pitor_hand_back            stop and return to the operator
 *
 *   /pitor                     show the run, or start intake if it is not done
 */

import type { AgentSession, ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { execFileSync } from "node:child_process";
import { Type } from "typebox";
import { readModeState } from "../lib/modes-registry";
import { runIntake } from "../lib/pitor-intake";
import {
  collectChange,
  pilingTask,
  pitanTask,
  type ReviewResult,
  runReviewer,
  seedEntries,
} from "../lib/pitor-review";
import {
  MAX_FIX_PASSES,
  NEXT_PHASE,
  type Phase,
  PITOR_KEY,
  type PitorState,
  readPitorState,
} from "../lib/pitor-state";

const AGENT_PREFIX = "agent/_ag__br_";

/** PiTan's session, kept across its re-runs within a review phase. Keyed by session id. */
const pitanSessions = new Map<string, AgentSession>();

function disposePitan(sessionId: string): void {
  pitanSessions.get(sessionId)?.dispose();
  pitanSessions.delete(sessionId);
}

function text(t: string, details: Record<string, unknown> = {}) {
  return { content: [{ type: "text" as const, text: t }], details };
}

function currentBranch(cwd: string): string | null {
  try {
    return execFileSync("git", ["-C", cwd, "symbolic-ref", "--short", "-q", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim() || null;
  } catch {
    return null;
  }
}

/** Guard shared by every tool: in PiTor, intake done, in the expected phase. */
function guard(ctx: ExtensionContext, phases: Phase[]): { state: PitorState } | { error: string } {
  const entries = ctx.sessionManager.getBranch();
  if (readModeState(entries).mode !== "pitor") return { error: "PiTor tools only work in PiTor." };
  const state = readPitorState(entries);
  if (!state.phase) return { error: "Intake has not completed. Ask the operator to run /pitor." };
  if (!phases.includes(state.phase)) {
    return { error: `This tool is for the ${phases.join("/")} phase; the run is in ${state.phase}.` };
  }
  return { state };
}

export default function (pi: ExtensionAPI) {
  const advance = (update: Partial<PitorState>) => pi.appendEntry(PITOR_KEY, update);

  // ── pitor_approve ──────────────────────────────────────────────────────────
  pi.registerTool({
    name: "pitor_approve",
    label: "PiTor: ask for approval",
    description:
      "Ask the operator to approve the design or the plan. Pass the full document. On approval the run moves to the next phase; otherwise you get the operator's requested changes.",
    parameters: Type.Object({
      phase: Type.Union([Type.Literal("design"), Type.Literal("plan")]),
      document: Type.String({ description: "The full design document or plan, as it should be recorded." }),
    }),
    executionMode: "sequential",
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const g = guard(ctx, [params.phase]);
      if ("error" in g) return text(g.error);
      if (!ctx.hasUI) return text("No UI to ask the operator. Stop and wait.");

      const choice = await ctx.ui.select(`PiTor — approve the ${params.phase}?`, ["Approve", "Request changes"]);
      if (choice !== "Approve") {
        const note = (await ctx.ui.input(`PiTor — what should change in the ${params.phase}?`))?.trim();
        return text(
          `The operator did not approve the ${params.phase}.` +
            (note ? ` Requested changes: ${note}` : " No note given; ask the operator what to change.") +
            ` Revise it with the operator, then call pitor_approve again.`,
        );
      }
      const next = NEXT_PHASE[params.phase]!;
      advance({ [params.phase]: params.document, phase: next });
      return text(`The operator approved the ${params.phase}. The run is now in the ${next} phase; follow its instructions.`);
    },
  });

  // ── pitor_implementation_done ──────────────────────────────────────────────
  pi.registerTool({
    name: "pitor_implementation_done",
    label: "PiTor: implementation done",
    description: "Call when the implementation is complete and committed on the agent branch. Moves the run to validation.",
    parameters: Type.Object({
      summary: Type.String({ description: "What was implemented, briefly." }),
    }),
    async execute(_id, _params, _signal, _onUpdate, ctx) {
      const g = guard(ctx, ["implement"]);
      if ("error" in g) return text(g.error);
      const branch = currentBranch(ctx.cwd);
      if (!branch || !branch.startsWith(AGENT_PREFIX) || branch.length === AGENT_PREFIX.length) {
        return text(
          `The current branch is ${branch ? `"${branch}"` : "unknown"}. The work must be on a branch that starts with ${AGENT_PREFIX}. ` +
            `Create it with \`git switch -c ${AGENT_PREFIX}<name>\`, commit there, then call this again.`,
        );
      }
      advance({ branch, phase: "validate" });
      return text(`Recorded branch ${branch}. The run is now in the validate phase.`);
    },
  });

  // ── pitor_validation_done ──────────────────────────────────────────────────
  pi.registerTool({
    name: "pitor_validation_done",
    label: "PiTor: validation done",
    description:
      "Report local validation. If it passed, the run moves to review. If it failed, stop: the implementation goes back to the operator.",
    parameters: Type.Object({
      passed: Type.Boolean(),
      results: Type.String({ description: "Each command run, its exit code, and the result. Say where the commands came from." }),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const g = guard(ctx, ["validate"]);
      if ("error" in g) return text(g.error);
      if (!params.passed) {
        if (ctx.hasUI) ctx.ui.notify("PiTor: validation failed. The run is waiting for your guidance.", "warning");
        return text(
          "Validation failed. Implementation is one shot: stop now, tell the operator what failed and why, and wait for guidance. " +
            "Do not fix it unprompted. If the operator asks you to fix it, do so on the branch and call pitor_validation_done again.",
        );
      }
      advance({ phase: "review" });
      return text("Validation passed. The run is now in the review phase: call pitor_review.");
    },
  });

  // ── pitor_review ───────────────────────────────────────────────────────────
  pi.registerTool({
    name: "pitor_review",
    label: "PiTor: review",
    description:
      "Run the reviewers on the current change: PiTan (has your context), then PiLing (fresh). Returns their findings, or moves the run to presentation.",
    parameters: Type.Object({}),
    executionMode: "sequential",
    async execute(_id, _params, signal, onUpdate, ctx) {
      const g = guard(ctx, ["review"]);
      if ("error" in g) return text(g.error);
      const state = g.state;
      const sid = ctx.sessionManager.getSessionId();

      const [provider, ...rest] = (state.reviewerModel ?? "").split("/");
      const model = provider ? ctx.modelRegistry.find(provider, rest.join("/")) : undefined;
      if (!model) return text(`The reviewer model ${state.reviewerModel} is not available. Tell the operator.`);

      let change: string;
      try {
        change = collectChange(ctx.cwd, state.baseSha);
      } catch (e) {
        return text(`Could not read the change from git: ${(e as Error).message}`);
      }

      const results: ReviewResult[] = [];
      const run = async (reviewer: "PiTan" | "PiLing"): Promise<ReviewResult> => {
        onUpdate?.({ content: [{ type: "text", text: `${reviewer} is reviewing on ${state.reviewerModel}…` }], details: {} });
        if (reviewer === "PiTan") {
          const existing = pitanSessions.get(sid);
          const { result, session } = await runReviewer({
            reviewer,
            cwd: ctx.cwd,
            model,
            existing,
            seed: existing ? undefined : seedEntries(ctx.sessionManager.getHeader(), ctx.sessionManager.getBranch()),
            task: pitanTask(state, change, !!existing),
            signal,
          });
          pitanSessions.set(sid, session);
          return result;
        }
        const { result, session } = await runReviewer({ reviewer, cwd: ctx.cwd, model, task: pilingTask(state, change), signal });
        session.dispose(); // PiLing is fresh every run
        return result;
      };

      try {
        let reviewer: "PiTan" | "PiLing" = state.pitanPassed ? "PiLing" : "PiTan";
        let result = await run(reviewer);
        results.push(result);
        // A clean PiTan pass goes straight on to PiLing, and does not use a fix pass.
        if (result.verdict === "PASS" && reviewer === "PiTan") {
          advance({ pitanPassed: true });
          reviewer = "PiLing";
          result = await run(reviewer);
          results.push(result);
        }

        const report = results.map(formatResult).join("\n\n");

        if (result.verdict === "PASS") {
          disposePitan(sid);
          advance({ phase: "present" });
          return text(`${report}\n\nBoth reviewers passed. The run is now in the present phase.`, { results });
        }

        // Findings. Three may go back to the author; the next result goes to the operator.
        if (state.fixPasses >= MAX_FIX_PASSES) {
          disposePitan(sid);
          advance({ phase: "present", capReached: true });
          if (ctx.hasUI) ctx.ui.notify("PiTor: review cap reached. The result goes to you.", "warning");
          return text(
            `${report}\n\nThe review cap is reached (${MAX_FIX_PASSES} fix passes used). Do not fix these findings. ` +
              "The run is now in the present phase: present the result to the operator and list these findings as unresolved.",
            { results },
          );
        }
        const used = state.fixPasses + 1;
        advance({ fixPasses: used });
        return text(
          `${report}\n\nFix pass ${used} of ${MAX_FIX_PASSES}. Fix the findings, commit, and call pitor_review again; ` +
            `${result.reviewer} will review again.` +
            (used === MAX_FIX_PASSES ? " This is the last fix pass: the next review result goes to the operator whatever it says." : ""),
          { results },
        );
      } catch (e) {
        return text(`Review did not complete: ${(e as Error).message}. No fix pass was used. Tell the operator.`, { results });
      }
    },
  });

  // ── pitor_hand_back ────────────────────────────────────────────────────────
  pi.registerTool({
    name: "pitor_hand_back",
    label: "PiTor: hand back to the operator",
    description: "Stop and return to the operator, for example when the implementation is not working. Does not change the phase.",
    parameters: Type.Object({
      reason: Type.String({ description: "What is not working and what you need from the operator." }),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const g = guard(ctx, ["design", "plan", "implement", "validate", "review", "present"]);
      if ("error" in g) return text(g.error);
      if (ctx.hasUI) ctx.ui.notify(`PiTor needs you: ${params.reason}`, "warning");
      return text("Handed back. Stop here, explain the situation to the operator, and wait for guidance.");
    },
  });

  // ── /pitor ─────────────────────────────────────────────────────────────────
  pi.registerCommand("pitor", {
    description: "Show the PiTor run, or start intake if it has not completed.",
    handler: async (_args, ctx) => {
      const entries = ctx.sessionManager.getBranch();
      if (readModeState(entries).mode !== "pitor") {
        ctx.ui.notify("/pitor works in PiTor. Switch with /mode pitor.", "warning");
        return;
      }
      const s = readPitorState(entries);
      if (!s.phase) {
        await runIntake(pi, ctx);
        return;
      }
      ctx.ui.notify(
        [
          `Phase: ${s.phase}`,
          `Author: ${s.authorModel}   Reviewer: ${s.reviewerModel}`,
          `Branch: ${s.branch ?? "(not created yet)"}   Base: ${s.baseBranch ?? "?"} @ ${s.baseSha?.slice(0, 8) ?? "empty"}`,
          `Review: ${s.pitanPassed ? "PiTan passed" : "PiTan pending"}, ${s.fixPasses}/${MAX_FIX_PASSES} fix passes${s.capReached ? ", cap reached" : ""}`,
        ].join("\n"),
        "info",
      );
    },
  });

  pi.on("session_shutdown", async (_e, ctx) => {
    disposePitan(ctx.sessionManager.getSessionId());
  });
}

function formatResult(r: ReviewResult): string {
  const cost = r.usage.cost ? `, $${r.usage.cost.toFixed(4)}` : "";
  const missing = r.verdictMissing ? " (no verdict line; treated as findings)" : "";
  return `## ${r.reviewer} (${r.model}, ${r.usage.input}+${r.usage.output} tokens${cost}): ${r.verdict}${missing}\n\n${r.text}`;
}
