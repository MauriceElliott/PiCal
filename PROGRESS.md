# Progress

Handoff notes for the mode/profile rework of this pi configuration.
No commits have been made. Everything below is working-tree only.

## Where it stands

Phases 0, 1, 2, 3 and 5 of the agreed plan are done and verified against a
stubbed extension host. Phase 4 (delete the approval gate), Phase 6 (PiTor →
PiOtrek reporting spike) and Phase 7 (README) are not started.

| File | Role |
|---|---|
| `agent/SYSTEM.md` | rewritten. Invariants only: identity, zero sycophancy, never commit, trust-based execution, config-exception clause, "Cal Newport" override. |
| `agent/modes/pical.md` | all the old tutor rules, plus the read-only contract. |
| `agent/modes/pina.md` | Socratic overlay. States that it narrows PiCal and never widens it. |
| `agent/modes/pitor.md` | stub. Phase spec, marked not implemented. |
| `agent/modes/piotrek.md` | stub. Board/orchestration spec, marked not implemented. |
| `agent/lib/modes-registry.ts` | single source: `MODES`, nested capabilities, `readModeState`, `statusText`, `PINA_FILE`, `WRITE_TOOLS`. |
| `agent/lib/capabilities-panel.ts` | startup overview component. Any key dismisses. No scrolling. |
| `agent/extensions/modes.ts` | sole prompt author. `/mode`, `/pina`, status, per-branch state, PiNa question. |
| `agent/extensions/welcome.ts` | deleted |
| `agent/extensions/approval-gate.ts` | still present, still prompting on write/edit. Slated for deletion. |

Prompt composition is `event.systemPrompt` (SYSTEM.md, already rendered by pi)
`+ agent/modes/<mode>.md` `+ agent/modes/pina.md` when PiCal and PiNa are on,
joined with `\n\n---\n\n`. Composition runs per agent run, so `/mode` and `/pina`
take effect on the next message with no reload.

## Decisions taken

1. **`SYSTEM.md` holds invariants only**, mode text lives in `agent/modes/`. A
   single `SYSTEM.md` could not be inherited by PiTor without dragging the
   tutor rules along.
2. **One extension owns the prompt.** `modes.ts` is the sole author. The
   approval-gate's prompt injection goes away with the gate.
3. **State is per-branch**, one `pi.appendEntry("modes", {mode, pina})` per
   change, replayed from `ctx.sessionManager.getBranch()` on `session_start`.
   `/new` starts at PiCal with PiNa off. Resume keeps its mode.
4. **Base tool list comes from `getAllTools()`, not `getActiveTools()`.** The
   latter would capture an already-filtered list on `/reload` and permanently
   lose `edit`.
5. **PiCal is a hard read-only mode**: `write`/`edit` are filtered out of the
   active set and rejected in `tool_call` with no dialog. Bash is not
   classified at all — read-only bash is prompt-enforced only, per instruction.
6. **PiNa is a two-state toggle, PiCal only.** Default off. `/pina`, `/pina on`,
   `/pina off`. Switching to another mode leaves the flag set but ignored, so
   returning to PiCal restores it.
7. **PiNa is offered, not assumed**: a `ctx.ui.confirm` after the panel on
   `startup`, and on `new` without the panel. Only when mode is `pical` and the
   branch has no `modes` entry yet. Declining writes nothing.
8. **Capabilities panel is presentational**, not a gate and not a menu. Any key
   dismisses, nothing shuts down. It is a component in `lib/`, not an extension,
   because the panel must be shown before the PiNa question and extension load
   order should not decide that.
9. **PiTor and PiOtrek are stubs.** Their prompts say plainly that they are not
   implemented and forbid simulating phases or fabricating reports.

## Verified behaviour

Driven through a stub `pi`/`ctx` with jiti (recipe below).

- startup → `PiCal`, tools `read,bash,grep,find,ls`; write/edit absent
- prompt: 2 sections, no PiNa text
- `write` in PiCal → `{block:true,reason:"PiCal is read-only: write is unavailable."}`
- `bash` in PiCal → passes through unclassified
- `/pina` → status `PiCal + PiNa`, 3 sections, hint ladder present; toggling back returns to 2
- `/mode pitor` → write/edit restored, PiTor spec only, no PiCal rules
- `/pina` in PiTor → warning, no state change
- `/mode` bare → 3-line list, `*` marker, `[not implemented]` tags
- resume from `{mode:"pitor",pina:true}` → restores both; `/new` resets to PiCal
- `startup`/`new` with no decision → panel (startup only) then confirm
- `resume`/`reload` → neither; already-decided branch → panel only
- panel renders at widths 84/60/40 with zero lines over the width

## Outstanding

**P4 — DONE, changed scope: the gate is kept, not deleted.**
`agent/extensions/approval-gate.ts` now gates only bash `git add`, `git commit`,
`git push` (token-based, sees through `git -C`, env/sudo/xargs wrappers and
`bash -c '...'`). All other tools and commands pass without a dialog. The gate
no longer injects prompt text; `modes.ts` stays the sole prompt author. Not
detected: git aliases, scripts that call git internally, `GIT_*` config tricks.
Tested with 34 command cases (0 failures) through a stub; the dialog itself was
not rendered.

**P6 — reporting spike**, doc only, no code. STATUS: analysis written to
`agent/modes/piotrek-reporting.md` (features F1-F13, failure modes, open questions);
schema NOT written, waiting on operator answers to its section 5. Original plan:
`agent/modes/piotrek-reporting.md` plus `agent/modes/report.schema.json`
(JSON Schema 2020-12). Shape agreed so far:

- envelope: `{schema, feature_id, agent_id, phase, attempt, timestamps}`
- breakdown: subtasks with status and artifacts
- certainty: a bounded scalar **plus** an evidence array (`command`,
  `exit_code`, `output_digest`), `assumptions[]`, `unknowns[]`. Rationale:
  self-reported scalar confidence is unactionable and systematically overconfident
- complexity: `plan_estimate` vs `actual` (LOC, files, hunks, turns) — the
  long-winded-implementation detector
- failure: `blocked_by`, `needs_human`
- one worked example: low confidence, high complexity, long-winded
- consumption table: which fields drive board columns and re-validation
- transport options, unranked: JSONL per feature / `appendEntry` + export /
  `pi -p --mode json` stdout

Prose decides the shape first; the schema is written to match it, not the
reverse.

**P7 — README**: profiles section and commands table.

## Deferred / out of scope

Container or VM lifecycle, worktrees, validation loops, PiOtrek worker transport,
`/clear` (point at builtin `/new`), any git write operation.

## Gotchas for the next session

- `@mariozechner/pi-tui` and `@earendil-works/pi-coding-agent` are aliased
  inside pi. A bare jiti load outside pi must alias the first one explicitly.
- The nix store path below is version-specific and dies on upgrade. Derive it:
  `PIBIN=$(readlink -f "$(command -v pi)")`, then base is
  `$(dirname "$PIBIN")/../lib/node_modules/pi-monorepo`.
- Ad-hoc harness recipe (no file written):
  `node --input-type=module - <<'EOF'` → `createJiti` from
  `<base>/node_modules/jiti/lib/jiti.mjs`, `jiti.import` the extension, stub
  `on/registerCommand/appendEntry/getAllTools/setActiveTools`, stub
  `ctx.ui.{setStatus,notify,confirm,custom}`, then fire handlers by hand.
- Panel has no scrolling by design. At 84 columns it is 30 lines; it will clip
  on a short terminal. Fix is fewer lines or two columns, not a scroll key.
- Wording in `MODES[].capabilities` and in `agent/modes/*.md` is provisional and
  written by the agent, not the operator. Worth a read before trusting it.
