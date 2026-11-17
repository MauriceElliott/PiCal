# PiOtrek reporting — analysis and features

Status: analysis only. No schema, no transport, no field names. Those come
after the features below are agreed. Not injected into any prompt.

## 1. What the report is for

A report exists to change a decision. If no consumer acts differently because of
a field, the field is noise. Consumers and the decisions they make:

| Consumer | Decisions |
|---|---|
| Orchestrator (heavy model) | accept, re-validate, retry, re-plan, split the feature, reorder the board, escalate |
| Operator (human) | where to spend review time, what to unblock, what to distrust |
| The worker itself, on retry | what was already tried, what failed, what not to repeat |
| Later sessions | why a thing is the way it is (decision record) |

Design test for every feature below: name the decision it changes.

## 2. The central problem: claimed versus observed

A worker's own report is a claim. The original shape (a breakdown, a sureness
percentage, a complexity estimate) is three claims. Self-reported confidence is
systematically overconfident and a bare percentage has no action attached.

Consequence: every report field falls into one of three classes, and the report
must make the class visible.

- **Observed**: produced by the harness, not the worker. Diff size, files
  touched, command exit codes, test results, wall time, token use, number of
  validation loops. The worker cannot inflate these.
- **Evidenced claim**: a worker statement that points at observed evidence
  ("tests pass" plus the command and its exit code).
- **Bare claim**: a worker statement with nothing behind it. Allowed, but
  weighted accordingly and never used alone to accept work.

## 3. Features

### F1. Outcome status
Done, partial, blocked, failed, abandoned. Coarse and enumerable; the board
column is derived from it. "Done" must be gated on evidence (F3), not asserted.
Decision changed: accept versus not.

### F2. Breakdown with per-subtask state
What the worker split the feature into, each with its own status and the
artifacts it produced. Lets a partial result be salvaged instead of redone.
Decision changed: retry whole versus resume the remainder; re-split.

### F3. Validation evidence
For each claim of correctness: the command, exit code, and a digest of the
output. Covers the local and remote validation phases separately, and records
which gates were never run. A missing gate is information, not an omission.
Decision changed: accept; where to re-validate.

### F4. Decomposed certainty, not a scalar
Certainty is reported as parts the operator can inspect:
- assumptions the worker made without checking
- unknowns the worker hit and did not resolve
- areas of lower certainty, each with a location (file and range) that can be
  opened in an editor, as PiTor's review step already requires
- an optional scalar, only as a summary of the above, never the primary signal
Decision changed: which parts get human or adversarial review.

### F5. Complexity: planned versus actual
The plan states an estimate before work starts (files, size, steps). The harness
records the actual. The gap is the signal.
- Observed side: lines, files, hunks, turns, validation loops, tokens, time.
- Churn: the same file rewritten repeatedly, reverted work, edits that cancel.
- Scope escape: files or interfaces touched that the plan did not list.
This is the long-winded-implementation detector. Because the actual side is
observed, it cannot be gamed by the worker.
Decision changed: flag for review; suspect a wrong plan; split the feature.

### F6. Decision record
Each non-obvious choice: what was chosen, what was rejected, why, and how
costly it is to reverse. PiTor's final presentation already asks for "the
decisions behind them"; this is the structured form.
Decision changed: what the operator challenges; what a later session inherits.

### F7. Interface and cross-feature impact
Changes to anything another feature could depend on (public signatures, schemas,
config, file layout), plus assumptions made about features not yet built.
This is the orchestrator's early warning of integration conflicts between
workers running separately.
Decision changed: re-order the board; re-plan dependent features.

### F8. Adversarial review outcome
Findings from the review phase, each with a disposition: fixed, disputed,
accepted risk, open. Separate from the worker's own certainty, because the
reviewer and the author must not be the same voice.
Decision changed: whether "pass" is real.

### F9. Blockers and human needs
What stopped progress, who or what can unblock it, and whether a human is
required. Distinguishes "failed" from "needs an answer".
Decision changed: route to operator versus retry versus re-plan.

### F10. Attempt history
Per attempt: what changed, what failed, why the worker thinks it failed. Lets
the orchestrator detect a loop (same failure across attempts) and stop paying
for it. Also what a retrying worker reads first.
Decision changed: retry, change strategy, or escalate.

### F11. Identity and provenance
Which feature, which worker, which phase, which attempt, which base revision,
which model and prompt version. Without the base revision a report cannot be
checked against the tree it describes.
Decision changed: whether a report is still valid after the tree moved.

### F12. Cost
Tokens, time, tool calls. Observed. Feeds budget limits and the long-winded
detector (F5).

### F13. Staleness
A report is true of one revision. Features that let a consumer tell it is out of
date once the base changes or a dependency (F7) moved.
Decision changed: re-validate versus trust.

## 4. Failure modes the reporting must resist

- **Overconfidence.** Mitigation: F3, F4 and the observed-versus-claimed split.
- **Metric gaming.** A worker told "low complexity is good" will report low
  complexity. Mitigation: F5 actuals are measured, not reported.
- **Narrative padding.** Long prose that reads as diligence. The orchestrator is
  a context-limited reader; fields beat paragraphs.
- **Silent omission.** A gate not run looks the same as a gate passed unless the
  report lists gates by name and state.
- **Stale truth.** F13.
- **Self-review.** Author and reviewer sharing context. F8 stays a separate
  voice.

## 5. Open questions for the operator

1. Is a scalar certainty wanted at all, or only the decomposed parts (F4)? The
   original brief asked for a percentage; the analysis says it is the weakest
   signal.
2. Who measures the observed fields: the harness around the worker, or the
   worker running a measuring command? Only the first is tamper-resistant, and
   the harness does not exist yet.
3. Which of F1–F13 are required for v1, and which are deferred? F1, F3, F5, F11
   are the minimum that makes a report checkable.
4. Is the report a single end-of-run artifact, or does the worker emit one per
   phase? Per-phase gives early warning and costs more context.
5. Does the orchestrator ever overrule a worker's status (for example, force
   "partial" when evidence is missing)? If yes, F1 needs two fields: claimed and
   accepted.
6. How long do reports live? A decision record (F6) is useful for years; an
   attempt history (F10) only until the feature merges.

## 6. Not decided here

Field names, schema, file formats, transport, board columns, thresholds for
"low certainty" or "high complexity", and where the harness runs. These follow
from section 5.
