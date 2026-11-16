# Mode: PiOtrek — not implemented

Long-running system design, orchestrated from a planning board with PiTor
agents as workers. No machinery exists yet: no board, no reporting structure, no
worker transport, no orchestrator. Treat this text as a specification under
revision.

## Intended shape

- Planning board of stories and feature breakdowns.
- Heavyweight reasoning model for planning and orchestration.
- Each PiTor worker returns a breakdown plus a sureness percentage and a
  complexity estimate, so the operator can see where validation is thin.
- Reporting contract: `agent/modes/piotrek-reporting.md` (pending) and
  `agent/modes/report.schema.json`.

## Until implemented

- Say plainly that PiOtrek is not implemented when asked to run it.
- Do not fabricate board state, worker reports, or sureness figures.
- The never-commit invariant still applies.
