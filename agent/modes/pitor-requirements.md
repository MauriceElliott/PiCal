# PiTor — requirements analysis

Status: analysis only. No design, no implementation. Not injected into any
prompt. PiTor remains not implemented; `modes/pitor.md` is unchanged.
Operator revised sections 1-5 (marked inline). Section 7 is the reviewer's
consolidated understanding of those revisions. Where section 7 and an earlier
section disagree, section 7 reflects the operator's later answers.

Sources: the phase spec in `pitor.md`, the invariants in `SYSTEM.md`, and the
reporting analysis in `piotrek-reporting.md` (PiTor is the producer of those
reports).

## 1. What PiTor is

One feature in, one reviewable change plus a report out, with a validate and
review loop in between. The operator is not in the loop between intake and
presentation unless a requirement below says so.

Existing, relevant facts:
- The mode machinery (`modes.ts`) already provides per-branch persisted state,
  a read-only tool filter, and prompt composition per run. It is mode-wide, not
  phase-wide.
- The approval gate stops only `git add`, `git commit`, `git push` in bash.
- pi documents isolation options (Docker, OpenShell, a Gondolin micro-VM
  extension). The docs I searched mention no subagent or worktree facility.
  **Here is the subagents extension: https://pi.dev/packages/pi-subagents**
- Invariant: nothing here may commit, amend, tag or push. This shapes several
  requirements below.

## 2. Requirements by phase

### R-intake. Input and acceptance criteria
A feature needs a statement and acceptance criteria before work starts.
Validation (R-validate) and review (R-review) have nothing to check against
otherwise. Requirement: acceptance criteria are an explicit input or an explicit
plan output that the operator can see, never inferred silently by the worker.
The user must be prompted for these details before work begins.

### R-plan. Plan
Output: a breakdown into subtasks and a plan estimate (files, size, steps). The
estimate must be stored before implementation, because the reporting analysis
(F5) compares it against the observed result. It must be immutable once
implementation starts, or the comparison is meaningless.

### R-design. Design
Output: a design overview and a decision record (choice, rejected alternatives,
reason, reversal cost). Feeds the final presentation and F6. Open: whether plan
and design are two artifacts or one (section 5).

### R-implement. Implementation
- Needs write access, confined to a workspace so a mistaken or destructive
  command has a bounded blast radius (workspace isolation, section 3).
- Must not commit. Consequence: the change exists only as an uncommitted diff,
  and there are no commits to checkpoint between attempts (section 4).
- Produces observed facts for the report: diff size, files, hunks, turns.

### R-validate. Validation, local then remote
- **Local:** which commands count (tests, lint, typecheck, build) must be
  declared per repository, not guessed by the worker. Each gate has a name and a
  recorded state: passed, failed, or not run. Evidence is the command, exit code
  and output digest (F3).
- **Remote:** undefined today. Remote validation normally means CI, which
  normally means a push, which is forbidden. A remote path with no push is a
  requirement to define, not an assumption to make (section 5, blocking).
  This step may be removed before implementation so ignore it for now.
- Validation must run outside the author's control: the author does not choose
  what to skip.

### R-review. Adversarial review
- Separate context from the author. A fresh session that receives the diff,
  plan and design but not the author's reasoning transcript.
- Preferably a different model, so author and reviewer do not share blind spots.
- Output: findings, each with a disposition (fixed, disputed, accepted risk,
  open) and a location (F8).
- Targeted by hotspots once the static-analysis stub exists; until then,
  untargeted.
- Read-only.

### R-loop. Failure loop
The spec says fail returns to validation "until it passes". As written it is
unbounded and omits the fix step (a failed validation needs an implementation
change before it can pass). Requirements:
- A hard attempt limit and a budget (time, tokens).
- No-progress detection: the same failure across attempts stops the loop (F10).
- A defined exit to "needs human" with the reason (F9) rather than a silent
  stall.

### R-present. Presentation
Changes, decisions, design overview and lower-certainty areas, each openable in
an editor. Requirements:
- Every item carries a file and line location, or a path to a document.
- An action opens an item in the operator's editor at that line. The operator's
  editor is not yet specified.
- Nothing is presented as passed that has no evidence behind it.

### R-report. Report emission
Per the reporting analysis: one report per run when changes occurred; v1 fields
F1, F3, F5 (stub, "not measured"), F11. The base revision (F11) must be recorded
at run start.

## 3. Cross-cutting requirements

### R-state. Persistent, resumable run state
A run has a phase, an attempt number, stored artifacts (plan, design, diffs,
evidence, findings). It must survive a reload or crash and be resumable without
repeating completed phases. `modes.ts` already persists mode state per session
branch; run state is larger and needs a defined home.

### R-phase-tools. Per-phase capability policy
Phases need different powers: plan, design and review read-only; implement
writes; validate runs commands but should not edit. Today the read-only filter is
mode-wide. Requirement: capability is a function of phase, enforced at the tool
layer like PiCal's, not only requested in a prompt.

### R-isolation. Workspace isolation
Autonomous operation makes a destructive command more likely and unattended.
The workspace must bound it. Options are unranked here: git worktree, a copy,
a container, or a micro-VM. Note that creating a worktree is itself a git write
that the gate does not cover, and an isolated copy still needs a way back to
the operator's tree.

### R-roles. Separate author and reviewer sessions
Section R-review needs a way to start a second agent with a different prompt,
tool set and possibly model. The documented building blocks are non-interactive
and JSON output modes, an RPC mode, and an SDK. Which to use is not decided.

### R-invariants. Enforcing never-commit under autonomy
The gate is a guard against accidents. It does not see aliases, scripts calling
git internally, or other-language subprocesses. Autonomous phases raise the
exposure. Requirement: decide whether prompt plus gate is sufficient, or
whether isolation must also remove the ability (for example, no git credentials
or no `.git` write access inside the implementing environment).

### R-human. Human checkpoints
The spec has exactly one: the final presentation. Whether the operator approves
the plan or design before implementation is not specified (section 5).

### R-budget. Limits
Attempts, wall time, tokens, and tool calls, per phase and per run. Feeds the
loop bound and report F12.

### R-honesty. Truthful status
`pitor.md` currently forbids simulating phases. When PiTor becomes real, that
text and the registry status must change together, and progress shown to the
operator must come from recorded state, not from the model's account.

### R-testability. Testing PiTor itself
A fixture repository with a known-failing and known-passing change, and a stub
runner like the harness used for `modes.ts`, so phase transitions, the loop
bound and the gate can be tested without a live model.

## 4. ADJUSTED BY OPERATOR: Tension created by the never-commit invariant

$$USER INPUT$$: I have review this and believe it should be adjusted, lets create a new
feature that says agents are allowed to commit as long as the branch name has "_ag__br_"
as part of its name. The agent is allowed to create that branch and then when the code or
feature is complete we will merge it to the current feature branch which will be done by the
operator.

## 5. Open questions

Blocking (the answer changes what must be built):
1. **Remote validation without a push.** What does "remote" mean for PiTor: a
   remote execution environment the tree is copied to, CI the operator triggers
   by hand, or something else?
Answer: Ignore this feature for now.
2. **Isolation boundary.** None, worktree, copy, container, or VM for v1? This
   decides whether R-invariants can be met by capability removal.
Answer: Ignore this feature for now.
3. **Acceptance criteria.** Supplied by the operator, drafted by the plan phase
   for approval, or both?
Answer: Supplied by the operator, or in the case of PiOtrek, supplied by PiOtrek
based off of the feature requested by the operator.

Shaping:
4. Plan and design: one artifact or two?
Answer: two, the plan is for steps, the design is an actual design phase where we
discuss what the correct route is, what it should look like, how the code should
be structured etc. It should come before plan.
5. Human checkpoints: only the final presentation, or also plan or design
   approval?
Answer: Design iteration loop then approve, plan iteration loop then approve
6. Loop limits: what attempt count and budget are acceptable?
Answer: Looping is between the operator and the author, not both. The actual implementation
phase should be a one shot and if it is not go back to the operator for further guidence.
To clarify, in the case of PiOtrek the operator is PiOtrek, who's rules will navigate
this eventuality in turn.
7. Operator's editor, for the open-in-editor action.
For now, open the file in helix, i.e. hx ./path/to/file.ext
8. Reviewer model: same as author, or a different one, and which?
Reviewer model should be different, i.e. if we used an anthropic model like Claude we use chatgpt
for the review. One of them with the context, and then advisarial should be without the context.
9. Per-repository validation commands: where are they declared?
.pical/instructions.md in the root of the repo. If they are not there use your best judgment.

## 6. A possible staging, for discussion only

Offered as a way to ask question 2, not as a decision.
- Stage A: persisted run state, phase machine and per-phase tool policy in one
  session, no isolation, validation local only, reviewer as a second pass.
- Stage B: workspace isolation and snapshots without commits.
- Stage C: separate reviewer session and model.
- Stage D: remote validation, once question 1 is answered.
- The static-analysis tool and the harness for observed report fields attach
  after Stage A.

## 7. Reviewer's understanding after the operator update

Written by the agent, not the operator. Correct anything that is wrong. The
operator's text above is unchanged.

### 7.1 The flow as I now understand it

1. **Intake.** The operator is prompted for the feature and its acceptance
   criteria before any work. Under PiOtrek, PiOtrek supplies them.
2. **Design.** Interactive. Operator and author discuss the route, the shape,
   the structure. Iterate, then the operator approves.
3. **Plan.** Steps only. Iterate, then the operator approves. Approval freezes
   the plan estimate that the report later compares against.
4. **Implement.** One shot, on an agent branch (name contains `_ag__br_`),
   commits allowed. If it does not succeed, it returns to the operator for
   guidance. There is no automatic retry loop.
5. **Validate.** Local only. Commands from `.pical/instructions.md` in the
   repository root, otherwise the validating agent's judgment.
6. **Review.** Two reviewers on a different model from the author: one with
   the author's context, one adversarial and without it.
7. **Present.** Changes, decisions, design, lower-certainty areas, each opened
   with `hx path[:row[:col]]`. Report emitted per the reporting analysis.
8. **Merge.** The operator merges the agent branch into the current feature
   branch. The agent does not.

The operator is a human, or PiOtrek. PiOtrek's own rules decide how an
escalation from a worker is handled.

### 7.2 What is deferred or removed

- Remote validation: out of scope. `pitor.md` phase 4 ("local, then remote")
  must be edited at implementation time.
- Isolation boundary: out of scope. Consequences in 7.4 (C2, C9).
- The attempt limit and no-progress detector from my R-loop: superseded by the
  one-shot rule. A budget for the single run is still undecided (C3).
- Staging in section 6: superseded; its questions 1 and 2 are now "ignore".

### 7.3 Changes needed outside this document, at implementation time

- `SYSTEM.md`: the invariant says never commit, "no exceptions, in any mode".
  The agent-branch rule is an exception, so the invariant text must change.
  Until the operator changes it, I treat it as unchanged and do not commit.
- `approval-gate.ts`: it gates every `git add/commit/push` regardless of
  branch. It must become branch-aware (C1).
- `pitor.md`: phase order (design before plan), no remote validation, no
  "return to 4 until it passes", operator checkpoints, one-shot implement, two
  reviewers.
- `modes-registry.ts`: PiTor capabilities text, status flip when real.
- Reporting analysis: F11's base revision becomes the branch point (merge-base),
  and F10/F5 can be computed from the agent branch's commits and diff, which
  largely dissolves section 4's original tension for agent branches.

### 7.4 Conflicts and consequences I found

**C1. Which commands the gate must cover once commits are allowed.**
Allowing commits "if the branch name contains `_ag__br_`" needs a check of the
current branch at call time, and that check is weaker than it looks:
- Other commands also create commits on the current branch and are not gated
  today: `merge`, `cherry-pick`, `revert`, `rebase`, `pull`, plumbing such as
  `commit-tree` and `update-ref`. Without a branch check on these, an agent on
  the feature branch can add commits without ever typing `git commit`.
- A single command can switch branch and commit (`git switch -c x_ag__br_ &&
  git commit`, or `git switch main && git commit`). The branch must be evaluated
  per segment in order, not once at the start.
- `git -C <other repo>` commits to a different repository and branch.
- A branch can be renamed into or out of the pattern (`git branch -m`).
- Detached HEAD has no name to match.
- Is the match a substring of the full ref name, exactly the string `_ag__br_`
  with two underscores in the middle? I read it literally.
- Is `git push` of the agent branch allowed? The operator text mentions commits
  and an operator merge, not push. I assume push stays gated.
- History rewriting on the agent branch (`--amend`, `reset`, `rebase`) is
  allowed by the same rule; confirm that is intended.

**C2. The agent branch lives in the operator's working tree.** With isolation
deferred, creating and switching to the branch changes what the operator has
checked out. Uncommitted operator changes either travel onto the branch or
block the switch. The operator cannot work in that tree during a run. Options,
unranked: require a clean tree at start, accept the interference, or revisit
isolation (a worktree would remove it).

**C3. "One shot" needs a definition.** I read it as: the implement phase runs
once; if validation fails, the work returns to the operator and does not loop
back to the author automatically. Open:
- Do review findings also return to the operator, or may the author address
  them once?
- A single run can still run away. Is a budget (time, tokens, tool calls) still
  wanted for it? Attempt history (F10) is now the sequence of operator-guided
  rounds.

**C4. The operator is an interface, not a person.** Intake questions, design
and plan iteration, approval, rejection with feedback, and failure escalation
must each be callable by a human (a prompt) or by PiOtrek (a structured
message). A UI dialog alone cannot serve PiOtrek. This also renames F9's
"needs human" to "needs operator".

**C5. Two reviewers and the model rule.**
- Contextual reviewer: different model from the author, has the context.
- Adversarial reviewer: no context. The operator text does not say which model
  it uses. I assume also different from the author. Confirm.
- Observed: `pi --list-models` shows only `github-copilot` models
  (`claude-haiku-5.5`, `claude-opus-5.5`, `claude-sonnet-5.5`, `gemini-4-argon`,
  `gemini-4-carbon`, `gpt-5.3-codex`) and `auth.json` has only `github-copilot`.
  `settings.json` defaults to `deepseek` / `deepseek-flash`, which is not in
  that list. I do not know which model the author will actually be, so the rule
  "reviewer differs from author" needs a defined mapping, for example by vendor
  family.
- Operator note: more GPT models are being added, so the current list is a
  point-in-time snapshot and not a constraint. The mapping rule still has to be
  defined; the `deepseek` default is still absent from the list I saw.

**C6. Validation commands fall back to judgment.** The fallback conflicts with
"validation runs outside the author's control". Requirement that resolves it:
the report and the presentation state where each gate came from, declared in
`.pical/instructions.md` or inferred, so an inferred gate is visible as such.
Also open: whether the file is free prose or has a convention (a heading, a
list of commands) that a machine can read. Free prose is parsed by a model and
can be misread.

**C7. helix runs in the terminal.** `hx 25.07.1` is installed and accepts
`file[:row[:col]]` (observed in `hx --help`). Opening it from inside pi's TUI
means suspending the TUI and restoring it afterwards, or opening another
terminal. The action does not exist for PiOtrek, which has no operator
terminal.

**C8. Plan approval is the freeze point.** The plan estimate is immutable from
approval, not from the start of implementation as I first wrote. Design
decisions (F6) are produced in the design phase and approved with it.

**C9. Deferred isolation and the invariants.** Capability removal can no longer
enforce never-commit, because commits are allowed on agent branches. It could
still bound `push` and destructive commands, but isolation is deferred. The
consequence, stated so it is a decision and not an accident: the blast radius of
an unattended implement phase is the operator's working tree, protected by
prompt and the gate only.

**C10. Merge authority under PiOtrek.** "The operator merges" means PiOtrek
merges when PiOtrek is the operator. A merge creates a commit on the feature
branch, which the invariant forbids for agents. Does the exemption extend to
PiOtrek's merges? Also: branch names for parallel workers need to be unique per
feature, and "the current feature branch" is ambiguous when PiOtrek runs several.

### 7.5 `pi-subagents` (first look; superseded by 7.9)

Source: https://pi.dev/packages/pi-subagents, README summary only. I did not
read its docs pages or its code, and it is not installed here.

Observed on the page:
- v0.89.0, MIT, `pi install npm:pi-subagents`, needs Pi 1.2.0 or newer (this
  install is 1.4.0).
- Children are separate Pi sessions with their own task. Foreground or
  background. Built-in agents include `scout`, `worker` (implements, validates,
  escalates unapproved decisions), `reviewer` (read-only), `oracle` (second
  opinion, no edits).
- Documented topics include per-role model selection, worktree isolation,
  review loops with a maximum number of rounds, acceptance gates, an opt-in
  adversarial change reviewer, child tool permissions, and a spawn cap per run.
- The page warns that packages execute code and should be reviewed first.

What it could cover, if the documented behaviour holds: R-roles, the two
reviewers (R-review), per-role models (C5), part of R-budget, and later
R-isolation.

Not verified, and each can change the decision:
- Whether a child session loads this configuration's extensions. If `modes.ts`
  loads in a child, the child starts in PiCal, read-only and in tutor register,
  and a `worker` could not write. If the gate does not load in a child, the
  git rules would not apply to it.
- Whether a reviewer can be started without the author's context, and another
  with it, as C5 needs.
- Whether per-phase tool restrictions (R-phase-tools) can be expressed.
- Whether it can be driven by PiOtrek rather than only by a person typing.
- What happens to the never-commit and agent-branch rules inside children.

### 7.6 Still open (as of the first review; 7.7 records what was answered and what remains)

1. C1: the branch check scope, the exact pattern, and whether push stays gated.
2. C2: how to treat the shared working tree.
3. C3: what returns to the operator, and whether a single-run budget is wanted.
4. C5: the adversarial reviewer's model, and the author-to-reviewer rule.
5. C6: structure of `.pical/instructions.md`.
6. C10: merge authority for PiOtrek, and branch naming across workers.
7. Whether to adopt `pi-subagents`, evaluate it first against the unverified
   list in 7.5, or build the roles directly on pi's RPC, JSON or SDK modes.
8. Plan and design artifacts: where they are stored, and in what form, so that a
   PiOtrek operator can read and approve them.

### 7.7 Operator decisions, round two, and what they leave open

Decisions, with my reading of each:

**D1. Author model.** Chosen as the first step of a new PiTor session, by the
operator. Reviewer models are then derived from it (rule still open, see below).

**D2. Git rules (answers C1).**
- `git push`: gated, always, in every mode including PiOtrek.
- `git add` and `git commit`: allowed when the current branch name contains
  `_ag__br_`.
- `git switch -c agent/_ag__br_<name_of_feature>`: allowed. Branch creation is
  the agent's job.
- Merges: by hand, so the agent is gated. PiOtrek may override this later; that
  override is a future adjustment, not built now.

**D3. Dirty working tree (answers C2).** If the tree is not clean at start, the
agent does nothing and tells the operator that the work tree is not clean and
needs committing or stashing. The agent never commits or stashes on the
operator's behalf.

**D4. PiOtrek and the exception (answers C10).** In PiOtrek mode the merge rule
is skipped, so PiOtrek may merge. PiOtrek still cannot push. Not built now, not
to be made impossible.

**D5. `pi-subagents`.** Deferred until PiOtrek is implemented. Not evaluated,
not installed.

Gate behaviour implied by D2, written as a table so it can be checked. Rows
marked `?` are my default, not an operator answer. Superseded by the table in
7.8.

| Command | On `_ag__br_` branch | On any other branch |
|---|---|---|
| `git add`, `git commit` | allow | gate |
| `git switch -c agent/_ag__br_<name>` | allow | allow |
| `git push` | gate | gate |
| `git merge` | gate | gate |
| `cherry-pick`, `revert`, `rebase`, `pull`, plumbing that creates commits | allow `?` | gate `?` |

Evaluation rules that follow, from the C1 hazards: the branch is read at call
time and per command segment in order, so `git switch -c x && git commit` and
`git switch main && git commit` are both judged correctly; `git -C <dir>` is
judged against that repository's branch; detached HEAD counts as "other".

What D1 to D5 leave open:

1. **Reviewer rule.** With the author chosen at session start, which models do
   the two reviewers use? "Different from the author" for both? Must the
   contextual and adversarial reviewers differ from each other, or may they be
   the same model?
2. **Merge scope.** Is `git merge` gated even on an agent branch (for example
   merging the feature branch into the agent branch to catch up)? I assumed yes.
3. **Other commit-creating commands.** The `?` row above.
4. **What "not clean" means.** Any output from `git status --porcelain`,
   including untracked files, or tracked changes only? Untracked files are
   covered by "stash" only with `-u`.
5. **When the cleanliness check runs.** At intake (earliest, avoids wasted
   design and plan work, but the operator may still be editing during those
   phases) or immediately before the agent branch is created.
6. **One-shot definition (C3), unanswered.** Do review findings go back to the
   operator, or may the author address them once? Is a single-run budget
   wanted?
7. **`.pical/instructions.md` structure (C6), unanswered.** Free prose or a
   machine-readable convention.
8. **Two reviewers without `pi-subagents`.** D5 removes the helper but not the
   requirement. A reviewer needs a fresh session, and the adversarial one needs
   none of the author's context. The mechanisms are pi's non-interactive, JSON
   and RPC modes or the SDK; I have not checked which fits and the choice
   belongs to design, not to this document.
9. **Where plan and design artifacts live,** and in what form, so that a future
   PiOtrek operator can read and approve them.
10. **Editor action, C7.** Suspend the TUI for `hx`, or open another terminal?

Consequence recorded: with the exception adopted, `SYSTEM.md` ("never commit,
no exceptions, in any mode") and `approval-gate.ts` both change at
implementation. Neither has been changed yet.

### 7.8 Operator decisions, round three

**D6. Reviewer models.** Both reviewers must differ from the author. They may
be the same model as each other. I read "differ" as a different model, not
necessarily a different vendor; confirm (see 7.10, item 1).

**D7. Gated git commands (answers open items 2 and 3).** `merge`, `cherry-pick`,
`revert`, `rebase` and `pull` are gated. PiOtrek may adjust this later; PiTor
does not. `pull` is gated because it can wipe out work. Updated table, which
replaces the one in 7.7:

| Command | On `_ag__br_` branch | On any other branch |
|---|---|---|
| `git add`, `git commit` | allow | gate |
| `git switch -c agent/_ag__br_<name>` | allow | allow |
| `git push` | gate | gate |
| `git merge`, `cherry-pick`, `revert`, `rebase`, `pull` | gate | gate |

**D8. Dirty tree.** Untracked files count as dirty. Ignored files do not (my
reading: any non-empty `git status --porcelain`).

**D9. Cleanliness check runs at intake.**

**D10. Review fix cap.** After review, the author may address findings at most
three times, then the work defers to the operator. I read this as three author
fix passes, each followed by a re-review, not three reviews of one diff.

**D11. `.pical/instructions.md` is free prose,** added to the agent's context,
not parsed. Pi's own context-file discovery does not know this path, so
something must read it explicitly (my observation from the layout; not checked
against pi's loader).

**D12. `pi-subagents` is adopted for the reviewers only.** The author, the plan
and design phases, validation, and the fix loop do not use it. Review in 7.9;
nothing installed.

Consequence: the git rule set is now fully specified except for related
commands (7.10, item 2).

### 7.9 Review of `pi-subagents` (https://github.com/nicobailon/pi-subagents)

Method: read the README and `docs/` (agents, models, workflows, watchdog,
tool-reference, extension-api, configuration headings), the `reviewer`, `worker`,
`oracle`, `delegate` and `scout` agent files, `src/api/delegation.ts`,
`package.json`, and npm registry metadata. I did not install it, run it, or read
the rest of the source.

**Maturity facts (observed).** 4,220 GitHub stars, MIT, not archived, pushed
2026-11-17. Version 0.89.0, 162 published versions, nine releases between
2026-10-22 and 2026-11-17 (every 2 to 7 days). No install or postinstall
scripts. Five runtime dependencies (`@js-temporal/polyfill`, `acorn`, `jiti`,
`undici`, `yaml`). Peers: `@earendil-works/pi-ai >=1.2.0` and the other pi
packages; this install is 1.4.0. Sixteen public export paths. Stars measure
popularity, not a security review.

**What fits the requirements.**
- **Reviewer role.** A built-in `reviewer` agent: read-only tools
  (`read, grep, find, ls, watchdog_diff, contact_supervisor`), no shell,
  `acceptanceRole: read-only`, thinking `high`, P0/P1/P2 findings with a merge
  verdict.
- **Two reviewers (D6, R-review).** Each launch chooses `context: "fresh"` or
  `"fork"`. Fresh is the adversarial reviewer. Fork inherits the author's whole
  transcript and is the contextual reviewer.
- **Different model per launch.** The delegation request has an optional
  `model` and `thinking`. The author model is the parent session's model, which
  matches D1 (author chosen at session start). Precedence order is documented in
  `docs/models.md`.
- **Structured, schema-validated results.** The delegation API takes a JSON
  Schema and returns a validated value. That is the natural carrier for review
  findings (F8): location, severity, evidence. Disposition (fixed, disputed,
  accepted risk, open) is assigned afterwards by the author or operator.
- **Observed usage.** The terminal response reports tokens, cost, turns, tool
  calls and duration, and the effective model. This is the harness-measured
  data for F12 (cost) without trusting the worker.
- **Driving it from our own extension.** The structured delegation API is
  documented for exactly this, foreground only. No slash command or typed
  prompt is needed, which also suits a future PiOtrek caller.
- **Capability ceilings.** An extension can register a session-scoped ceiling
  (allowed agents, allowed tools, deny extensions) that children cannot exceed.
- **Round cap.** Its `/review-loop` prompt defaults to a maximum of three review
  rounds, matching D10. It also launches a child `worker` to apply fixes,
  which we do not want (the author fixes), so the loop itself would not be
  used, only the reviewer launches.

**Hazards and gaps (each is either observed in the docs or flagged as
unverified).**
1. **It adds an agent catalogue wider than we want.** Installed globally, the
   parent gains a `subagent` tool and children `worker`, `delegate`, `scout`
   and `oracle`. All four have `bash`; three also have `write`/`edit`. Foreground
   children never load the parent's ambient extensions, which includes
   `approval-gate.ts`, so a child's `git push` would not meet our gate. PiCal's
   read-only filter would also not apply to the child's own tools. The documented
   mitigation is a capability ceiling registered by our extension, restricting
   allowed agents to the reviewer. The ceiling must be registered under
   `ctx.sessionManager.getSessionId()`; the docs say a path-keyed registration
   does not apply. Whether the ceiling fully closes this I have not tested.
2. **Extension loading differs by child type (documented).** Foreground
   children load no ambient extensions, so `modes.ts` would not turn the
   reviewer into a read-only PiCal tutor. Background children do load them
   unless the agent sets `extensions`, in which case `modes.ts` would apply.
   This was the main risk in 7.5; the documentation resolves it, but only for
   foreground children, which is what the structured delegation API uses.
3. **The reviewer has no shell and cannot see committed ranges by itself.**
   Its own prompt states `watchdog_diff` does not inspect committed ranges and
   asks for a supplied artifact. The author commits on an agent branch, so the
   review input must be a diff we produce (for example the range from the
   branch point to HEAD) and hand over as a file or in the task. The reviewer
   also cannot run tests; it reports commands for a supervisor to run. This is
   consistent with validation staying outside the author's control (R-validate).
4. **Fork leaks the author's reasoning.** A forked child keeps the parent's full
   system prompt and transcript. If its model differs from the parent's, the
   inherited thinking blocks are sent to that model's provider as plain text.
   Under D6 the contextual reviewer is always a different model, so this always
   happens. Fork also fails if the parent session is not persisted. It is
   acceptable only if the operator accepts the author's reasoning going to the
   reviewer model's provider; every model here is currently reached through
   `github-copilot`, but I did not check how that provider routes vendors.
5. **"Without the context" needs a definition.** The `reviewer` agent has
   `inheritProjectContext: true`, so a fresh child still receives project
   context files. The operator wording says the adversarial reviewer has no
   context. Does that mean no transcript only, or also no plan, design and
   acceptance criteria?
6. **Version churn.** Pre-1.0 and released every few days. The delegation API is
   versioned (`v1` event names), but the package is not. Pin the version, and
   treat an upgrade as a change to review.
7. **Third-party code in-process.** It runs with the parent's privileges and
   loads from a package manifest. Pi's docs warn to review package source
   first. I have read docs and one type file, not the source. Reading the
   delegation, capability-ceiling and child-launch paths is a precondition.
8. **Prompt-cache cost.** The docs say its catalogue section keeps the provider
   cache only if no other extension returns a replacement `systemPrompt` from
   `before_agent_start`. `modes.ts` does so on every run. This costs tokens on
   some models and is not a correctness problem.
9. **Unneeded surface.** Workflows, missions, schedules, background runs,
   FleetView, Herdr and Rex integrations, external CLI runners (Codex, Claude
   Code), and the opt-in watchdog (a second model that reviews every turn). None
   are needed for D12. The watchdog overlaps with the reviewer role and should
   stay off. Keeping the scope small matters because the package is large.

**Not verified.** Whether the structured delegation API works as documented from
a `pi.on(...)` callback in this pi version; whether `model` accepts
`github-copilot/<id>`; whether `fork` works with `modes.ts` persisting entries on
the branch; whether a capability ceiling stops a model-initiated `subagent`
call for a non-reviewer agent; how `.pical/instructions.md` interacts with
`inheritProjectContext`; and how `SYSTEM.md` reaches a child with
`systemPromptMode: replace`.

**Integration surface this review points to, for design later.** Only three of
the package's exports are relevant: `pi-subagents/delegation` (launch a reviewer
and receive a validated result), `pi-subagents/capability-ceiling` (restrict
children to the reviewer), and possibly `pi-subagents/required-child-extensions`
(only if a child must load a specific extension of ours). This is a pointer, not
a design.

### 7.10 Open after round three

1. **Reviewer difference.** Different model, or different vendor family?
Answer: PiTan and PiLing both need to models from a different vendor family, i.e. openAI if the author is an anthropic, or DeepSeek, or GLM, or Kimi K3, etc. Just something other than another Claude model essentially, this is the one that will be defined at the start of the session though so don't worry too much about it. Both PiTan and PiLing can have the same model.
2. **Related destructive commands.** The reason given for gating `pull` (it can
   wipe out work) also applies to `git reset --hard`, `git clean`,
   `git checkout -- <path>`, `git restore`, `git stash drop` and
   `git branch -D`. Today none is gated. Extend the gate, or accept the gap?
Accept the gap.
3. **Adversarial reviewer input.** Diff only, or diff plus plan, design and
   acceptance criteria?
Diff + Plan, not context.
4. **Fork acceptability.** Is it acceptable that the author's reasoning is sent
   to the contextual reviewer's model provider (hazard 4)?
Yes, acceptable, currently these are all coming from a single provider, i.e. github copilot.
5. **Scope of installation.** Install globally, or only load it where PiTor
   needs it? A global install adds the `subagent` tool and its catalogue to
   PiCal and PiVez as well (hazard 1).
Answer: See response about sub agent functionality.
6. **Source review.** May I read the package's delegation, capability-ceiling
   and launch source before anything is installed? Hazard 7 treats that as a
   precondition.
Answer: See response ""
7. **Two reviewers at once or in sequence,** and whether the three-fix cap
   (D10) counts re-reviews by both reviewers as one pass.
Answer: One in sequence is fine, they are phased, not happening at the same time.

### 7.11 Operator decisions, round four (answers recorded in 7.10)

**D13. Reviewer model rule.** PiTan and PiLing must both use a model from a
different vendor family than the author (for example OpenAI, DeepSeek, GLM or
Kimi when the author is a Claude model). Both may use the same model. The
reviewer model is chosen at session start, together with the author model (D1).
Consequence: a model-to-family mapping is required. Today Copilot ids carry the
family in their prefix (`claude-*`, `gemini-*`, `gpt-*`), which is fragile, and
the rule needs a defined result for an unknown family.

**D14. Destructive commands.** `reset --hard`, `clean`, `checkout --`,
`restore`, `stash drop` and `branch -D` stay ungated. Accepted gap.

**D15. PiLing input.** Diff plus plan, and not the author's context. Settled in
D21: the plan includes the acceptance criteria; the design is excluded.

**D16. Fork acceptable.** The author's reasoning may reach the reviewer model's
provider; today every model is reached through `github-copilot`.

**D17. Review order.** One reviewer at a time, in phases, never concurrent.

**D18. Names.** PiTan: the close reviewer, with the author's context. PiLing:
the adversarial reviewer, without it.

**D19. Scope of `pi-subagents`.** (Superseded by D20: not used at all.) Take the bare minimum: only the ability to
spawn a sub-agent, then build profiles for PiTan and PiLing. This overrides
D12's "adopt it for the reviewers", and answers 7.10 items 5 and 6 as "do not
install broadly".

### 7.12 Finding: pi's own SDK already spawns a sub-agent

Observed in the installed pi 1.4.0 (`docs/sdk.md`, `dist/core/sdk.d.ts`,
`dist/core/resource-loader.d.ts`, `dist/core/session-manager.d.ts`,
`examples/sdk/11-sessions.ts`). The docs for `pi-subagents` also state that its
foreground children are sessions inside the parent process built on the host
SDK, so the spawn it offers is a wrapper over what is below.

What `createAgentSession` accepts, each documented:
- `model`, `thinkingLevel`: a per-session model, so the reviewer model (D13) is
  an argument.
- `tools` (allowlist), `excludeTools`, `noTools`, `customTools`: a child limited
  to `read, grep, find, ls` has no `bash`, `edit` or `write`. Read-only by
  construction at the tool layer, with no catalogue and no ceiling needed.
- `sessionManager`: `SessionManager.inMemory(cwd, options, entries?)` can be
  seeded with entries; `forkFrom(sourcePath, ...)` and `createBranchedSession`
  exist. These are the candidates for PiTan's context.
- `resourceLoader` (`DefaultResourceLoader`): `noExtensions`, `noContextFiles`,
  `noSkills`, `systemPromptOverride`, `appendSystemPrompt`. A child with
  `noExtensions` loads neither `modes.ts` nor the git gate; a child with no
  `bash` has nothing for the gate to guard.
- `session.prompt()`, `subscribe()`, `abort()`, `dispose()`, and the
  `agent_settled` event: run, observe, time-limit, and discard.

What the SDK does not give, compared with `pi-subagents`: a validated
structured-output protocol, per-child usage totals as a ready data shape,
background and async runs, a fleet view, capability ceilings, budgets, and
artifacts. Of these, sequential foreground reviewers (D17) need only structured
findings and usage. Findings could be a `customTools` tool the reviewer must call
(an approach, not a decision); usage is on the session's messages (not checked).

What this would avoid, from the 7.9 hazards: no global `subagent` tool and no
bash-capable agent catalogue (hazard 1), no third-party code in the parent
process (7), no pre-1.0 release churn (6), no prompt-cache interaction (8), and
no surplus surface (9). A forked child would also not have to inherit the
author's whole system prompt, because we supply the reviewer's own.

What it would cost: we own and maintain the launcher, its timeouts and its
failure handling, instead of a package's.

Not verified (none of it run): that an extension can call `createAgentSession`
from inside a pi callback; that a Copilot model id resolves through the default
`ModelRuntime` and reuses the parent's credentials; how seeding an in-memory
manager with the author's branch behaves, and whether the author's tool-call and
thinking entries replay on another vendor's model; where usage and cost are read
from; and whether `DefaultResourceLoader` still injects `SYSTEM.md` into a child
under `noContextFiles`.

### 7.13 Open after round four

1. **SDK or package.** Spawn through pi's SDK directly (7.12) and install
   nothing, or install `pi-subagents` and use only its delegation API? I
   recommend the SDK, because the package's value over it is background runs and
   structured output that sequential reviewers barely use, and its hazards
   remain.
2. **PiLing's "plan".** Does the plan input include the acceptance criteria?
   Is the design excluded?
3. **Order and the fix cap.** Is the order PiTan then PiLing? Does a "pass" in
   the three-fix cap (D10) mean one author fix followed by re-running only the
   reviewer that raised the finding, or by re-running both?
4. **What a profile is.** Are PiTan and PiLing spawn-only (called by PiTor), or
   also selectable like modes (for example to review a branch by hand)?
5. **Family rule at session start.** If the chosen reviewer model shares the
   author's vendor family, should the session refuse, warn, or ask again?

### 7.14 Operator decisions, round five (answers to 7.13)

**D20. Spawn through pi's SDK.** `pi-subagents` is not installed and not used.
This supersedes D12 and D19. Section 7.9's hazards no longer apply; its
"not verified" list is replaced by the one in 7.12.

**D21. PiLing's input.** Diff, plan, and the acceptance criteria. The design is
excluded, as is the author's transcript. (Design inclusion reversed by D30.)

**D22. Review return cycles.** The cap is three in total. A findings return from
either PiTan or PiLing is one cycle. My reading, to confirm: the author may fix
after each of the first three returns; a fourth return goes to the operator
instead of to the author. This supersedes D10's per-reviewer ambiguity.

**D23. PiTan and PiLing are part of PiTor.** They are spawn-only, started by
the review phase. They are not modes: they do not appear in `MODES`, `/mode` or
the startup panel, and the operator cannot select them.

**D24. Family check at session start.** If the chosen reviewer model shares the
author's vendor family, warn and require explicit confirmation before
continuing. The check needs the model-to-family mapping from D13, including a
defined result for an unknown family (which I assume is also a warning, not a
silent pass).

### 7.15 The reviewer profiles as currently specified

For reading at a glance. Everything here is an operator decision except where
marked.

| | PiTan | PiLing |
|---|---|---|
| Role | close reviewer | adversarial reviewer |
| Author's context | yes (forked or seeded) | no |
| Input | diff, plan, design, author context (updated in 7.20) | diff, plan, design (updated in 7.20; acceptance criteria assumed, confirm) |
| Excluded | | author transcript |
| Model | different vendor family from the author; may equal PiLing's | same rule |
| Tools | read-only (`read`, `grep`, `find`, `ls`), my assumption | same |
| Extensions in the child | none (my assumption, from 7.12) | none |
| Output | findings with location and severity, plus a verdict | same |
| Spawned by | PiTor review phase | PiTor review phase |
| Order | first | second |
| Concurrency | none | none |

Shared rules: one reviewer at a time; a findings return from either counts as
one of three return cycles; after three the work defers to the operator;
families differ from the author's or the operator confirms the exception.

The diff handed to both is the range from the branch point to HEAD of the agent
branch, produced by us (decision-free consequence of commits being allowed on
`_ag__br_` branches). The order PiTan then PiLing is my reading of D17/D18 and
the answer to item 3; confirm with the operator.

### 7.16 Still open

1. **Re-review order after a fix.** After the author fixes findings from one
   reviewer, which runs next: the same reviewer again, or restart at PiTan?
2. **D22 reading.** Three author fixes then a fourth return to the operator, or
   the third return itself goes to the operator?
3. **Unknown family.** Warn and require confirmation, as with a match?
4. **What the spike must settle** (from 7.12): whether `createAgentSession` can
   be called from an extension callback; whether a Copilot id resolves and
   reuses credentials; how an in-memory manager seeded with the author's branch
   behaves on a different vendor's model; where usage and cost are read from;
   and what the child's system prompt contains under `noExtensions` and
   `noContextFiles`.

### 7.17 Operator decisions, round six (answers to 7.16)

**D22 (final).** The author gets at most three fix passes. The fourth reviewer
result goes to the operator, whether it found issues or passed. The operator
therefore always receives the final result and the author never self-certifies.
Each findings return from PiTan or PiLing is one of the three cycles.

**D25. After a fix, the same reviewer runs again.** PiLing is always a fresh,
unpolluted context on every run; it is never resumed or reused. PiTan is not
stated; I assume it is seeded again from the author's current branch.

**D26. Unknown vendor family** triggers the same warn-and-confirm as a match.

**D27. Order** is PiTan first, then PiLing.

Combined reading of D17, D22, D25 and D27, written as a sequence so it can be
checked: PiTan runs; findings return to the author for a fix and PiTan runs
again; when PiTan returns clean, PiLing runs fresh; findings return to the
author for a fix and PiLing runs fresh again; the cap counts every findings
return across both reviewers; the fourth result goes to the operator.

### 7.18 Spike results

Two throwaway scripts and one throwaway extension in `/tmp/spike/` (not in this
configuration), using `github-copilot/gpt-5.3-codex` as the reviewer model.
Everything below was observed in output, in one run each.

| Question (from 7.12) | Result |
|---|---|
| Does a Copilot id resolve and reuse credentials? | Yes. Via `ModelRuntime.getModel` standalone, and via `ctx.modelRegistry.find` inside pi. No key setup. |
| Can an extension call `createAgentSession`? | Yes, from a command handler in a real pi process (`pi -p -ne -e ext.ts "/spike"`). The parent stayed alive. |
| Is the child confined? | Yes. 0 extensions loaded, active tools exactly `read,grep,find,ls`. Asked to run `echo hi` it replied `NOBASH` and made no tool call. |
| What is in the child's system prompt? | Only the override text plus a `<cwd>` block (154 and 98 characters). None of `PiCal`, `PiTor`, `sycophancy`, `Cal Newport`, `never commit` appeared. |
| Does a seeded context replay on another vendor? | Yes. 11 entries from a `claude-opus-5.5` session (thinking blocks and tool calls) replayed on gpt-5.3-codex without error, and the reply used the transcript (it named the WSL clipboard work). |
| Where do usage and cost come from? | `session.getSessionStats()` and the last assistant message's `usage`. |
| Does it leave side effects? | None found: no repository changes, no new session files, `auth.json` unchanged by the spike. |

Findings that change requirements:

1. **`getSessionStats()` includes the seeded history.** Before the reviewer's
   turn it already reported 14,960 tokens and $0.0775 (three Opus messages).
   The reviewer's own turn was 2,813 tokens and $0.004984. Usage for PiTan must
   be a delta against a baseline taken before prompting, or the sum of the
   `usage` of assistant messages added after it. The last message's `usage.cost`
   matched the delta exactly. A naive read would bill the author's work to the
   reviewer.
2. **Reviewers do not inherit our invariants.** Because the child prompt is only
   what we supply, "zero sycophancy" and the rest of `SYSTEM.md` do not apply
   to PiTan or PiLing unless we write them in. This is a design choice to make
   on purpose.
3. **The child is confined by construction,** not by a gate or a prompt: with
   no `bash`, `edit` or `write` tool, there is nothing to guard. The confinement
   evidence is the active-tool list; the `NOBASH` reply is corroboration from
   the model, not proof.
4. **PiTan's cost scales with the author's transcript.** The seeded run read
   3,345 input, 4,936 cache-read and 8,256 cache-write tokens for seven
   messages. A full PiTor session will be larger; this was not measured.
5. **Reviewer quality, one sample.** The fresh reviewer found a real defect in
   the test diff (`median` returns the upper middle for even-length lists) and
   an empty-list case. One diff is an anecdote, not an evaluation.
6. Latency, one turn at low thinking: about 8.5 s fresh, 3.1 s seeded.

Still not verified: calling it from `tool_call`, `before_agent_start` or
`agent_end` hooks; interactive mode with the TUI; large or compacted
transcripts; seeding from a live session's `getBranch()` instead of a file;
`abort()` and timeouts; a `customTools` findings tool; the family check;
several children in a row; the second `ModelRuntime` that `createAgentSession`
creates alongside the parent's under concurrent credential refresh.

### 7.19 Still open

1. **Do clean passes count toward the fourth result?** If PiTan and PiLing both
   pass with no findings, that is two reviewer runs and zero returns. Does the
   "fourth go" count reviewer runs or findings returns? D22 says returns; the
   phrase "4th go" reads like runs.
2. **PiTan's seed.** Re-seeded from the author's current branch on every run
   (my assumption), or one retained session resumed?
3. **Should the reviewers carry any of the invariants** (no sycophancy, facts
   only, evidence over assertion)? Finding 2 above.

### 7.20 Operator decisions, round seven (answers to 7.19), and a correction

**D28. What the cap counts.** "Just reviewers": the three-cycle cap counts
findings returned by PiTan or PiLing, and exists to stop a dead loop in which a
method or implementation is simply not working. My reading: a clean pass is not
a loop iteration and does not consume the cap. This replaces the "4th go"
ambiguity in 7.19, item 1.

**D29. PiTan's seed.** PiTan is not re-seeded each run. It receives the
author's context once, at the start of the review cycle, and I read that as
keeping the same session across its re-runs. Consequences, not decisions:
- PiTan remembers its own earlier findings, which is what lets it notice that a
  finding keeps coming back. PiLing, being fresh on every run, cannot.
- PiTan's copy of the author's context goes stale as the author fixes things.
  Each re-run must therefore be handed the current diff, or PiTan reviews code
  it has not seen.
- This revises D25's assumption that PiTan is re-seeded.

**D30. PiLing's input.** Plan, design, and the diff ("the deltas"), still with
no author transcript. This reverses D21, which excluded the design. Whether the
acceptance criteria are still included is not stated; I assume yes (they are
usually in the plan).

**D31. The invariants and PiTan (answers 7.19, item 3, with a correction).**
The assumption was that PiTan inherits the invariants by receiving the author's
full context. It does not, on the evidence I could gather:
- A session transcript does record the author's system prompt, as a
  `system`-role entry whose text is in a `sections` field and whose `content` is
  empty. Both the small session used in the spike and this live session have one.
- When that transcript is seeded into a child, the entry is present in the
  child's `session.messages` (first, role `system`), but the child's effective
  system prompt is only what we supply.
- Test: with the seeded entry present, the child (gpt-5.3-codex) was asked
  whether any instruction anywhere in its context described PiCal, a "tutor and
  research only agent", or rules like "never commit". It answered
  `NO — NONE`.
Caveats: one model, one sample, the model's own report, and the seed was an old
session with an older prompt. I did not read how pi serialises the entry for the
provider. Conclusion: assume the author's system prompt does not reach PiTan, so
anything the reviewers should obey must be written into the prompt we supply.
This also means the transcript PiTan reads is the conversation and the author's
reasoning, without the rules the author was working under.

### 7.21 Still open

1. **"Review cycle" in D29.** I read it as the whole review phase, from the
   first PiTan run until the result goes to the operator. Confirm, or is it one
   findings return?
2. **PiLing and the acceptance criteria.** Included (my assumption) or not?
3. **Which invariants the reviewers carry,** now that they are not inherited.
   Candidates from `SYSTEM.md`: no sycophancy, facts only, state only what was
   observed. "Never commit" has no effect on a child with no shell. Decide the
   wording once and use it for both.

### 7.22 Operator decisions, round eight (answers to 7.21)

**D32. "Review cycle" means the whole review phase.** From the first PiTan run
until the result reaches the operator. Confirms the reading in D29: PiTan is
seeded once per review phase.

**D33. PiLing gets the acceptance criteria.** Confirms the assumption in D30.
PiLing's input is therefore the diff, the plan, the design and the acceptance
criteria, with no author transcript.

**D34. Both reviewers carry the base system prompt.** Taken to mean
`agent/SYSTEM.md` itself, supplied by us because a seeded transcript does not
carry it (D31). Layering would match what `modes.ts` already does for modes: the
base text, then a role prompt for PiTan or PiLing. Because the child's prompt is
whatever we build, a later edit to `SYSTEM.md` (such as the agent-branch
exception) reaches the reviewers automatically.

### 7.23 What the current `SYSTEM.md` would do inside a reviewer

Read from the file as it is today. `SYSTEM.md` mixes conduct rules with the
PiCal persona, and some lines do not fit a reviewer:

| Line | Effect on a reviewer |
|---|---|
| "You are PiCal, a tutor and research agent... Teach, do not answer." | Conflicts with the role. A reviewer's output is findings, which are answers. `SYSTEM.md` itself says invariants decide *conduct* and the mode decides the *subject*, so it is unclear which side "teach, do not answer" is on. |
| "Zero sycophancy... Facts only." | Applies as intended. |
| "State only what you observed. Never claim a command ran, or a test passed, without the output in front of you." | Applies and matters: reviewers have no shell, so they must not claim tests pass. |
| "Never commit, amend, tag, or push." | Harmless: no shell. Will change when the agent-branch exception is written. |
| "Execution is trust-based: there is no approval gate." | Already untrue (a gate for `git add/commit/push` exists). Meaningless for a child with no tools that execute. |
| "The only exception to mode rules is adjusting this pi configuration itself." | Irrelevant. |
| "`/mode`... `/pina`..." | Irrelevant; the reviewer has no commands. |
| "Cal Newport" override | Irrelevant; no user is in a child session. It would only be noise, and a model might be steered by it. |

This also contradicts decision 1 recorded in `PROGRESS.md` ("`SYSTEM.md` holds
invariants only"): the file holds a persona as well.

### 7.24 Open before design

1. **How literally to take D34.** Options, unranked:
   - Verbatim `SYSTEM.md` plus a role prompt that states explicitly which lines
     it overrides (for instance, that findings are the output and the
     teach-do-not-answer line does not apply).
   - Split `SYSTEM.md`: keep conduct rules in it, move the PiCal persona and the
     slash-command and override lines into `modes/pical.md`, so the base text is
     reusable by a reviewer unchanged. This also makes decision 1 true again,
     and edits `SYSTEM.md`, which is the operator's file.
   - A reviewer-specific base that copies only the conduct lines.
   Which one?

The remaining decisions are all recorded. Not verified items from 7.18 still
stand, and the biggest is the call site: the spike called the SDK from a command
handler, not from the hook the review phase would run in.

### 7.25 Operator decision, round nine: the persona moves out of `SYSTEM.md`

**D35. Split `SYSTEM.md`.** Taken as the second option in 7.24. The PiCal
persona and teaching rules belong to the PiCal mode, not the base layer. The
operator edited `SYSTEM.md` by hand (modified 13:38, observed by diff against
HEAD) and supplied the old PiCal prompt. The agent then rewrote
`agent/modes/pical.md` from it.

State of `SYSTEM.md` as edited by the operator (observed):
- Persona line is now "You are PiCal: A personal coding agent."
- The "Never commit, amend, tag, or push. No exceptions, in any mode." line is
  gone.
- The "Cal Newport" override is gone. Operator: replaced by PiTor.
- Still present: zero sycophancy; "Execution is trust-based: there is no approval
  gate"; "State only what you observed"; the config-and-prose exception; the
  `/mode` and `/pina` line.

State of `modes/pical.md` after the rewrite: the operator's old rules, in the
operator's wording, under Read-only, Teaching and Register. Not carried over:
- The "Cal Newport" rule (operator instruction).
- The old "use the specified approval gate for CLI mutation" rule. The gate now
  covers only `git add/commit/push`, so the sentence would be false. The current
  rule, that bash mutation is not PiCal's to run, replaces it.
- The "zero sycophancy" line: already in the base layer.
- The config-and-prose exception: already in the base layer (see item 3 below).
- The agent-written line "describe the change precisely: which file, symbol,
  line", which was not in the operator's prompt and works against
  teach-don't-answer.

Effect on the reviewers (D34): the base layer no longer carries the tutor
persona or "teach, do not answer", so the main conflict in 7.23 is resolved.
The remaining lines that do not fit a reviewer are in item 2 below.

### 7.26 Open after the split

1. **"Never commit" is no longer in any prompt.** `SYSTEM.md` dropped it, and
   nothing yet states the replacement rule (commits allowed on `_ag__br_`
   branches, never push, merges by hand). Meanwhile the gate still blocks
   `git add/commit` on every branch, because it is not yet branch-aware. Is the
   removal intended to be filled by PiTor's mode text, and should PiCal and
   PiVez carry any version of it?
2. **Base lines that do not fit a reviewer or PiTor.**
   - "Execution is trust-based: there is no approval gate": untrue today (a gate
     exists).
   - The `/mode` and `/pina` line: command help for PiCal, not conduct.
   - "You are PiCal": a reviewer or PiTor session would carry that name.
   Edit `SYSTEM.md`, move these to `modes/pical.md`, or leave them?
3. **The exception clause cannot operate in PiCal.** The base says the only
   exception to mode rules is editing this pi configuration and prose that is
   not code. PiCal removes `write` and `edit` entirely (D5 in PROGRESS). The
   model is told it may edit config and cannot. Options: allow `write`/`edit` in
   PiCal only for the pi directory and non-code prose (a path rule in
   `modes.ts`), or drop the clause from the base.
4. **"When we switch to PiTor the context is cleared."** `/mode` today changes
   the composed prompt and the tool set only; the conversation is kept. Is a
   cleared context a requirement (a mode switch starts a fresh session), or a
   description of the prompt layer being swapped? It bears on PiTor's intake and
   on what PiTan's seed would contain.

### 7.27 Operator decisions, round ten, and what was implemented

**D36. Git rule and branch pattern.** The base layer says: never commit or stage
(`git add`, `git commit`) except on a branch whose name starts with
`agent/_ag__br_`. PiCal is stricter: never commit or stage on any branch, and
never make code changes. The branch name must **start with** `agent/_ag__br_`
and have at least one character after it. This supersedes "contains
`_ag__br_`" in D2, 7.7 and 7.8, which were operator-confirmed earlier and are
now narrower. `push`, `merge`, `cherry-pick`, `revert`, `rebase` and `pull`
remain gated on every branch (D7).

**D37. `SYSTEM.md` cleanup.** Removed "You are PiCal"; removed the `/mode` and
`/pina` line (the capabilities popup already lists `/mode`, `/pina` and `/new`);
removed only the false clause "there is no approval gate".

**D38. The config-and-prose exception clause is removed from the base.** PiCal
edits nothing, and no path rule was added to `modes.ts`. Config and prose edits
therefore happen in a mode that has write tools (PiVez, or PiTor).

**D39. A mode switch clears context.** `/mode X` starts a new session in mode X.
Entering PiCal asks the PiNa question again, which is how PiNa is switched on or
off after a wrong choice at launch. Entering PiTor is where the author and
reviewer model choice (D1, D24) and the clean-tree check (D9) belong; those are
not implemented.

**D40. PiTan and PiLing are overlays to PiTor, not modes.** Reviewer prompt is
the base layer plus the overlay (E1: not `pitor.md`). Spawn-only (E2). The
overlay files do not exist yet.

**D41. PiOtrek is not a top-level mode.** It is a layer above PiTor that controls
PiTor sub-agents. It is not implemented, and PiTor is hardened first. Context is
kept in `agent/modes/piotrek.md`, which is no longer loaded into any prompt.
Top-level modes are PiCal, PiTor and PiVez.

#### Implemented

| File | Change |
|---|---|
| `agent/SYSTEM.md` | Retitled "Invariants"; persona, `/mode` line, exception clause and "no approval gate" removed; branch-based git rule added. |
| `agent/modes/pical.md` | "You are PiCal" moved here; strict no-commit and no-stage rule added. |
| `agent/modes/piotrek.md` | Rewritten as design notes, not a mode. |
| `agent/lib/modes-registry.ts` | `piotrek` removed from `ModeId` and `MODES`; comment records the overlay and layer structure. |
| `agent/lib/capabilities-panel.ts` | `/mode [pical|pitor|pivez]`, "switch mode (starts a new session)". |
| `agent/extensions/modes.ts` | `/mode X` calls `ctx.newSession`; PiTor and PiVez get their mode written by `setup`; PiCal gets no entry so the PiNa question is asked. |
| `agent/extensions/approval-gate.ts` | Branch-aware git gate (below). |

Gate rules as implemented:

| Command | Behaviour |
|---|---|
| `git add`, `git commit` | Allowed when the branch they will run on starts with `agent/_ag__br_` plus at least one character. Gated otherwise, including when the branch cannot be determined. |
| `git push`, `merge`, `cherry-pick`, `revert`, `rebase`, `pull` | Always gated. |
| `git switch -c agent/_ag__br_<name>` and every other command | Not gated. |

The branch is read at call time (`git symbolic-ref --short -q HEAD`) and tracked
through the command chain. A `cd`, `-C`, `switch`, `checkout` or branch rename is
trusted for the next command only when they are joined by `&&`; after `;`, `||`,
`|`, `&`, a newline or a substitution the branch is treated as unknown and
`add`/`commit` are gated, because the earlier command may have failed. `--git-dir`,
`GIT_DIR`, `GIT_WORK_TREE`, a detached HEAD, an unreadable directory, and a path
with `$`, `~` or a backtick are unknown. Unknown is gated. The dialog and the
no-UI block message state the reason.

#### Verified

- Gate: 94 command cases against a stubbed branch resolver, 0 failures, covering
  the chain traps (`switch -c ... ; commit`, `|| commit`, `& commit`, a switch to
  a non-agent name, an empty name after the prefix, a `-C` to another repo, a
  later switch away from the agent branch, `bash -c`, `sudo`, `env`). 13 more
  rows against real git repositories with no commits, 0 wrong. No commits were
  created in any test repository.
- `/mode`: 24 stub checks, 0 failures (new session on switch, entry written for
  PiTor and PiVez, PiNa re-asked on entering PiCal, no panel on switch, cancelled
  switch leaves state alone, `piotrek` rejected, write/edit filtering per mode,
  prompt composition per mode).
- Real pi: a throwaway extension in `pi -p` called `ctx.newSession({setup,
  withSession})`: `session_start` fired with reason `new`, the new branch held
  the entry written by `setup`, `withSession` ran, and `newSession` returned
  `cancelled=false`. This was done in a scratch directory with no model call.

Not verified: the interactive TUI path (dialog rendering for a gated command,
the PiNa confirm after a `/mode pical`), `/mode` while the agent is streaming,
and the new gate under `pi` with a real `git commit` going through it.

#### Known gaps, stated so they are decisions and not accidents

1. **The gate does not know the mode.** In PiCal the no-commit rule is prompt-only
   plus the read-only tool filter; the gate would allow a `git commit` on an agent
   branch even in PiCal.
2. **Alias and script blind spots remain** (`git ci`, a script that calls git,
   another language's subprocess).
3. **History rewriting on an agent branch is allowed** (`--amend`, `reset`,
   `clean`, `restore`, `stash drop`, `branch -D`): decided as an accepted gap
   (D14); `--amend` falls under `commit`.
4. **Heuristic parsing.** `git checkout <name>` is read as a branch switch even
   if `<name>` is a path; a quoted path containing spaces degrades to "unknown",
   which gates. Equivalent paths that differ only by symlink are looked up in
   git, not matched in the chain, so they also gate.
5. **PiVez now has no identity line.** `SYSTEM.md` names no agent and PiVez has
   no mode text, so a PiVez session carries invariants only.
6. **The base text says mode rules are "appended below them at runtime by the
   `modes` extension"**, which will be untrue for a reviewer child (D34).

#### Still open

1. Should the capabilities popup also show after a `/mode` switch? It currently
   shows only at launch.
2. Should the gate learn the mode (gap 1)?
3. PiVez identity (gap 5).

### 7.28 Operator decisions, round eleven, and what was implemented

**D42. The capabilities popup also shows after a `/mode` switch.** Shown first;
for PiCal the PiNa question follows it, the same order as at launch. A plain
`/new` still shows no popup.

**D43. The gate knows the mode.** In PiCal, `git add` and `git commit` are
refused outright (no dialog) on every branch, including an agent branch. The
mode is read from the session branch with `readModeState`, the same source
`modes.ts` uses, so the two cannot disagree. `push`, `merge`, `cherry-pick`,
`revert`, `rebase` and `pull` keep their dialog in PiCal. This closes known gap 1
in 7.27.

**D44. The README is rewritten** around the capabilities as they now stand. The
original pitch, the Cal Newport paragraph, Installation and Recommended Tools
are kept verbatim; the modes, overlays, commands, gate, base rules, layout and
known limitations are new.

Implementation notes:
- Whether module state survives `ctx.newSession` was tested in a real pi process:
  the extension factory runs again but top-level variables keep their value, so
  `/mode` sets a module-level flag that the next `session_start` reads once. The
  flag is cleared if the switch is cancelled.
- Gate verification: the earlier 94 cases still pass with mode unset; 37 new
  cases (PiCal refusals including chains and `bash -c`, PiTor and PiVez on and off
  agent branches, a handler test against real repositories with no commits)
  pass. No commits were created.
- `/mode` verification: 28 stub checks pass, including popup-before-PiNa-question
  ordering, no popup on a plain `/new`, and no popup after a cancelled switch.

#### Found while writing the README

1. **The mode indicator is probably never visible.** `modes.ts` sets a status
   entry, but `terminal-prompt.ts` blanks the default footer and draws its own
   status line, which does not include extension statuses or the mode. This has
   been true since the footer was replaced; `/mode` is the only way to see the
   current mode. Fix, if wanted: add the mode to `buildStatusLine` in
   `terminal-prompt.ts`. Not changed.
2. **`agent/modes/pitor.md` is stale.** It is the prompt PiTor loads today. It
   still lists plan before design, "local, then remote" validation, and a "fail,
   return to 4 until it passes" loop, all superseded by this document. Not
   changed.

#### Still open

1. Add the mode to the status line (finding 1).
2. Rewrite `pitor.md` to the decided plan (finding 2). It is still "not
   implemented", so it would remain a spec, not a procedure.

### 7.29 Operator decisions, round twelve (resolves 7.28's open items)

**D45. The mode is shown in the status line.** `terminal-prompt.ts` now includes
it between the path and the model (`π ~/r/p > PiCal + PiNa > model - level`),
read from the session branch with `readModeState` and `statusText`, cached on the
session leaf id so it is not recomputed per keystroke. An unimplemented mode is
drawn in the warning colour, the others in the accent colour. A stale context
shows no mode and does not throw. This resolves finding 1 in 7.28.

**D46. `pitor.md` is rewritten to the decided plan.** It remains marked not
implemented, so it is still a specification and not a procedure. It now carries:
the seven-step flow (intake with model choice, family warning and clean-tree
check; design; plan; one-shot implement on `agent/_ag__br_<name>`; local
validate; review by PiTan then PiLing with the three-return cap; present), the
operator abstraction (human or PiOtrek), the rules that already hold, and the
instruction to say so when it disagrees with this document. The PiTor entry in
the capabilities popup was updated to match. This resolves finding 2 in 7.28.

Verification:
- Status line: 11 checks through the real extension and widget with a stubbed
  host (default PiCal, PiNa on, PiTor, PiVez, colour per status, cache keyed on
  leaf, widths 200 to 40 never overflow, stale context). All pass.
- Regression: gate 94 + 37 cases, `/mode` flow 28 checks, panel width test at 84,
  60 and 40 columns. All pass. The PiTor prompt composes as base plus mode text
  (2 sections).
- Not exercised: the real TUI rendering of the status line, and PiTor's prompt
  under a live model.

Costs and notes:
- The popup is now 33 lines at 84 columns (it was 30) and does not scroll.
- The PiTor prompt now states the operator touchpoints and the review cap to a
  model that cannot act on them yet; it is told not to simulate them.
- `README.md` is updated: status-line sentence added, the two fixed limitations
  removed, the layout notes for `pitor.md` and `terminal-prompt.ts` corrected.

#### Still open

Nothing from this round. Items still undecided across the document are in 7.26's
and 7.28's lists that were not answered: the PiVez identity line (7.27 gap 5),
and the `PiOtrek` questions in 7.4 C10, which wait for PiOtrek.
