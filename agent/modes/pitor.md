# Mode: PiTor — not implemented

One feature, start to finish, with review, on an agent branch. No machinery
exists yet: no phase runner, no run state, no reviewer spawning, no validation
loop, no report emission. Treat this text as a specification, not as an
operating procedure you can execute.

## Intended flow

1. **Intake.** The operator supplies the feature and its acceptance criteria,
   prompted for before any work begins. At the start of the session the operator
   also chooses the author model and the reviewer model. The reviewer model must
   come from a different vendor family than the author's; if it does not, or the
   family is unknown, warn and require explicit confirmation. Then check the
   working tree: if `git status --porcelain` shows anything (untracked files
   count, ignored files do not), do nothing and tell the operator the work tree
   is not clean and needs committing or stashing. Never commit or stash on the
   operator's behalf.
2. **Design.** A discussion with the operator about the route, the shape and the
   structure of the code. Iterate, then the operator approves. Output: a design
   overview and a decision record (choice, rejected alternatives, reason, cost
   of reversal).
3. **Plan.** Steps only. Iterate, then the operator approves. Approval freezes
   the plan estimate (files, size, steps).
4. **Implement.** One shot, on a branch created with
   `git switch -c agent/_ag__br_<name>`. Commits are allowed there and nowhere
   else. Never push. If the implementation does not succeed, stop and return to
   the operator for guidance; there is no automatic retry loop.
5. **Validate**, locally. Take the commands from `.pical/instructions.md` in the
   repository root (free prose, read as context); if it is absent, use your own
   judgment and say which gates were declared and which were inferred. Record
   each gate as passed, failed or not run, with the command, exit code and an
   output digest. Remote validation is out of scope.
6. **Review**, by two spawned read-only sessions, one at a time:
   - **PiTan**, the close reviewer, has the author's context, taken once at the
     start of the review phase and kept across its re-runs. Hand it the current
     diff on every run.
   - **PiLing**, the adversarial reviewer, is fresh on every run: the diff, the
     plan, the design and the acceptance criteria, and no author transcript.
   PiTan runs first, then PiLing. After a fix, the same reviewer runs again. The
   author may address findings at most three times in total across both
   reviewers, counting each findings return from either as one. The fourth
   reviewer result goes to the operator whether it passes or not.
7. **Present.** The changes, the decisions, the design overview and the areas of
   lower certainty, each opened for the operator with `hx path[:row[:col]]`.
   Nothing is presented as passed without evidence. The operator merges the
   branch. One report is emitted per run that produced changes.

## Operator

The operator is a human, or PiOtrek, a layer above PiTor that is not
implemented. Every operator touchpoint above (acceptance criteria, design and
plan approval, escalation after a failed implementation, the review hand-off)
must be answerable by either.

## Rules that already hold

- Commit and stage only on an `agent/_ag__br_<name>` branch. `push`, `merge`,
  `cherry-pick`, `revert`, `rebase` and `pull` always go through the gate.
- Merges are the operator's.

## Until implemented

- Say plainly that PiTor is not implemented when asked to run it.
- Do not simulate the phases, play PiTan or PiLing yourself, or report progress
  that did not happen.
- The decided plan, with its history and open items, is in
  `agent/modes/pitor-requirements.md`. If this text and that document disagree,
  say so instead of choosing.
