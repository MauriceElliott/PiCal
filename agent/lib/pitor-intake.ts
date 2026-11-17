/**
 * PiTor intake
 *
 * Runs when a session enters PiTor (called by extensions/modes.ts after the
 * capabilities overview) and again from /pitor while intake is incomplete.
 *
 *   1. git repository and clean work tree, else stop and say so
 *   2. feature
 *   3. acceptance criteria
 *   4. reviewer model; warn and confirm if same or unknown vendor family
 *
 * The author model is the session's model. Nothing is written until every step
 * has an answer, so a cancelled intake leaves no state.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { execFileSync } from "node:child_process";
import { modelFamily, PITOR_KEY } from "./pitor-state";

function git(cwd: string, args: string[]): string | null {
  try {
    return execFileSync("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    }).trim();
  } catch {
    return null;
  }
}

export async function runIntake(pi: ExtensionAPI, ctx: ExtensionContext): Promise<boolean> {
  if (!ctx.hasUI) return false;

  // 1. Work tree
  if (git(ctx.cwd, ["rev-parse", "--show-toplevel"]) === null) {
    ctx.ui.notify("PiTor needs a git repository. Open pi inside one, then run /pitor.", "error");
    return false;
  }
  const status = git(ctx.cwd, ["status", "--porcelain"]);
  if (status === null || status !== "") {
    ctx.ui.notify(
      "PiTor: the work tree is not clean. Commit or stash your changes (untracked files count), then run /pitor.",
      "warning",
    );
    return false;
  }

  // 2, 3. Feature and acceptance criteria
  const feature = (await ctx.ui.editor("PiTor — the feature: what should be built?", ""))?.trim();
  if (!feature) return cancelled(ctx);
  const criteria = (await ctx.ui.editor("PiTor — acceptance criteria: how do we know it is done?", ""))?.trim();
  if (!criteria) return cancelled(ctx);

  // 4. Reviewer model
  const author = ctx.model;
  if (!author) {
    ctx.ui.notify("PiTor: no model is selected for this session, so there is no author model.", "error");
    return false;
  }
  const authorFamily = modelFamily(author.id, author.provider);
  const available = ctx.modelRegistry.getAvailable();
  const name = (m: { provider: string; id: string }) => `${m.provider}/${m.id}`;
  const ordered = [
    ...available.filter((m) => modelFamily(m.id, m.provider) !== authorFamily),
    ...available.filter((m) => modelFamily(m.id, m.provider) === authorFamily),
  ];
  if (ordered.length === 0) {
    ctx.ui.notify("PiTor: no models with working credentials to review with.", "error");
    return false;
  }
  const choice = await ctx.ui.select(
    `PiTor — reviewer model for PiTan and PiLing (author: ${name(author)}, ${authorFamily ?? "unknown family"})`,
    ordered.map(name),
  );
  if (!choice) return cancelled(ctx);
  const reviewer = ordered.find((m) => name(m) === choice)!;
  const reviewerFamily = modelFamily(reviewer.id, reviewer.provider);

  if (!authorFamily || !reviewerFamily || authorFamily === reviewerFamily) {
    const why = !authorFamily || !reviewerFamily
      ? `The vendor family of ${!authorFamily ? name(author) : name(reviewer)} is unknown.`
      : `${name(reviewer)} is from the same vendor family as the author (${authorFamily}).`;
    const ok = await ctx.ui.confirm(
      "PiTor — reviewer model",
      `${why} Reviewers are meant to come from a different family so they do not share the author's blind spots. Use it anyway?`,
    );
    if (!ok) return cancelled(ctx);
  }

  pi.appendEntry(PITOR_KEY, {
    phase: "design",
    feature,
    criteria,
    authorModel: name(author),
    reviewerModel: name(reviewer),
    baseSha: git(ctx.cwd, ["rev-parse", "--verify", "-q", "HEAD"]) || null,
    baseBranch: git(ctx.cwd, ["symbolic-ref", "--short", "-q", "HEAD"]) || null,
    fixPasses: 0,
    pitanPassed: false,
  });
  ctx.ui.notify("PiTor: intake done. Design phase. Send a message to start the design discussion.", "info");
  return true;
}

function cancelled(ctx: ExtensionContext): false {
  ctx.ui.notify("PiTor: intake cancelled. Run /pitor to start it again.", "info");
  return false;
}
