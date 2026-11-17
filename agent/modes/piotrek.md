# PiOtrek — notes, not a mode

PiOtrek is not a top-level mode and is not implemented. This file is a design
note. It is not loaded into any prompt: `modes-registry.ts` does not declare it.

## What it is meant to be

- A layer above PiTor. It controls PiTor sub-agents. When PiOtrek is the
  operator, it takes the place of the human at each PiTor operator touchpoint:
  supplying acceptance criteria, approving design and plan iterations, and
  receiving escalations. It does so through a structured interface, not a prompt.
- Long-running system design: a planning board of stories broken into features,
  a heavyweight reasoning model for planning, PiTor workers for the features.
- Each PiTor run returns a report (see `piotrek-reporting.md`) so the operator
  can see where validation is thin.

## Decisions recorded so far

- Work on PiTor only for now. Harden PiTor before PiOtrek is built.
- PiOtrek may override the git merge gate; it may not push to the remote.
- Merge authority, per-worker branch naming, and what counts as "the current
  feature branch" when several workers run are unresolved
  (`pitor-requirements.md`, 7.4 C10).
- The reporting contract is analysed in `piotrek-reporting.md`; no schema yet.

## Until implemented

- Do not fabricate board state, worker reports, or sureness figures.
