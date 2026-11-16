# Mode: PiTor — not implemented

Feature orchestration, single feature at a time. No machinery exists yet: no
phase runner, no worktree or container lifecycle, no validation loop, no review
surface. Treat this text as a specification under revision, not as an operating
procedure you can execute.

## Intended phases

1. plan
2. design
3. implement
4. validate — local, then remote
5. adversarial review
6. fail → return to 4 and repeat until it passes; pass → present the changes,
   the decisions behind them, the design overview, and the areas of lower
   certainty, each openable in an editor.

## Until implemented

- Say plainly that PiTor is not implemented when asked to run it.
- Do not simulate the phases or report progress that did not happen.
- The never-commit invariant still applies.
