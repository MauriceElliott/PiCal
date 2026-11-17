# PiCal

PiCal is a Pi configuration designed to stop your skills atrophying while still offering you the following benefits:
- An on the job tutor
- A Rubber duck
- A quick reference
- A stack overflow and github issues crawler
- A incompetent researcher
- A Let me Google That for You-er

It is designed with 1 simple goal, help your thinking instead of doing it for you. The cal in PiCal is from Cal Newport, the writer of DeepWork, and Digital Minimalism, both of which implore readers take head space, think for themselves, and to not become another money bag for the attention economy.

That is the default behaviour. The configuration also has a mode for when you do want the work done (PiTor, specified but not yet built) and one for when you want no rules beyond the basics (PiVez). Switching between them is deliberate and clears the conversation.

## Modes

| Mode | Status | What it is |
|---|---|---|
| **PiCal** | works | The default. Read and research. You write the code. |
| **PiTor** | specified, not implemented | One feature, start to finish, with review. |
| **PiVez** | works | Open ended. You and the model, all tools, no mode rules. |

`/mode` with no argument lists them. `/mode <name>` switches (see [Commands](#commands)).

### PiCal

A tutor and research only agent. The goal is to teach you enough to make it obsolete, so it advises and does not do.

- **Read-only.** `write` and `edit` are removed from the tool set and rejected if called. It does not make code changes, does not make plans, and never commits or stages (`git add`, `git commit`), on any branch.
- **Bash mutation is a rule, not a lock.** It is told not to create, change, move or delete files or run installs. Nothing in the tooling stops a mutating bash command in PiCal other than the git gate below.
- **It teaches by pointing.** "What are the inputs to this function?" gets "here is how you find them": go-to-definition, another function that can provide the values, or documentation, not the list.
- **Straight answers** for syntax and error messages. Not for "why doesn't this compile" (it wants the specific error), not for "what is the best way" (it gives several options, unranked), and not for 64 lines of pasted log (it asks for the exact error).
- **"I need a library for X"** is a search. It uses `ddgr` and returns `title of the link - url`, preferring an awesome-list.
- It reads the codebase only to aid understanding, and tries to answer without it first.
- Concise answers; short questions get short answers.

### PiNa: the Socratic overlay on PiCal

PiNa narrows PiCal further; it never widens it. It is off by default. PiCal asks whether to enable it when it starts, and `/pina` turns it on and off later.

With PiNa on and when you explicitly ask to be taught (*teach me*, *tutor me*, *quiz me*, *drill me*, *help me master*), it runs a structured session: a short diagnostic, a skill map with levels 0 to 5, one question at a time, spaced review of earlier subskills, and a final assessment. Levels are earned over two or more checks. It does not answer a one-off "what is X" with a quiz.

At any point you can say: *show progress*, *harder*, *easier*, *just tell me* (answers the current question straight, once), *save state*, or *resume from:* followed by a saved block.

### PiTor (not implemented)

Selecting PiTor today gives you an agent that says so. It has write tools and no machinery behind it: no phase runner, no validation loop, no review step. Its prompt (`agent/modes/pitor.md`) holds the plan below and tells it not to pretend otherwise.

The plan, with its history, is in [`agent/modes/pitor-requirements.md`](agent/modes/pitor-requirements.md), decided with the operator in rounds. In outline:

1. **Intake.** You supply the feature and its acceptance criteria. The clean-tree check happens here: if the working tree has uncommitted or untracked files, it stops and tells you to commit or stash.
2. **Design**, then **Plan**. Each is an iteration loop with you, then your approval. The plan is frozen on approval.
3. **Implement.** One shot, on a branch named `agent/_ag__br_<name>`. If it does not work, it comes back to you for guidance; there is no automatic retry loop.
4. **Validate**, locally. Commands come from `.pical/instructions.md` in the repository (free prose added to context), otherwise its own judgment. Remote validation is out of scope for now.
5. **Review** by two spawned reviewers, one at a time. The author may address review findings up to three times in total, then the result goes to you. The fourth reviewer result reaches you whether it passes or not.
6. **Present** the changes, the decisions, the design and the lower-certainty areas, each opened in `hx`. You merge the branch.

The author and reviewer models are chosen when a PiTor session starts. The reviewers must come from a different vendor family than the author; if they do not, you get a warning and have to confirm.

Reviewers are separate sessions made through pi's own SDK. A spike showed a child session with no extensions and only `read`, `grep`, `find` and `ls` on a different model; `pi-subagents` was reviewed and not adopted.

### PiTan and PiLing (not implemented)

Overlays to PiTor, not modes. They are spawned reviewer sessions: the base rules plus a role prompt, no shell, no edit tools.

| | Context | Gets |
|---|---|---|
| **PiTan**, the close reviewer | The author's context, taken once at the start of the review phase | Diff, plan, design, acceptance criteria |
| **PiLing**, the adversarial reviewer | Fresh every run, no author transcript | Diff, plan, design, acceptance criteria |

### PiVez

Open ended. No mode prompt, so the base rules below are all that apply, and every tool is available including `write` and `edit`. The git gate still applies.

### PiOtrek (not a mode, not implemented)

A layer above PiTor that will control PiTor sub-agents and act as their operator. Work on PiTor comes first and PiOtrek waits until it is hardened. Notes are in [`agent/modes/piotrek.md`](agent/modes/piotrek.md); an analysis of what its worker reports need is in [`agent/modes/piotrek-reporting.md`](agent/modes/piotrek-reporting.md). Neither is loaded into a prompt.

## Commands

| Command | What it does |
|---|---|
| `/mode` | List the modes; `*` marks the current one. |
| `/mode pical`, `pitor`, `pivez` | Switch mode. **Starts a new session:** the conversation is not carried over, the old session stays available through pi's session resume. Shows the capabilities overview. Entering PiCal asks the PiNa question again, which is how you correct a wrong choice at launch. |
| `/pina`, `/pina on`, `/pina off` | Toggle the Socratic overlay. PiCal only. Does not start a new session. |
| `/new` | pi's own command: fresh context, starts in PiCal. |

When pi starts it shows a capabilities overview (any key dismisses it), then asks about PiNa if you are in PiCal. The overview is shown again after every `/mode` switch. The status line above the editor shows the current mode between the path and the model, for example `π ~/r/project > PiCal + PiNa > gpt-5.3-codex - medium`; an unimplemented mode is shown in the warning colour. `/mode` with no argument lists them.

## Approval gate

The configuration has one gate, and it is about git. It reads your current mode and branch each time the agent runs a bash command.

| Command | PiCal | Any other mode |
|---|---|---|
| `git add`, `git commit` | **refused**, no dialog, on every branch | allowed on a branch named `agent/_ag__br_<name>`; otherwise a dialog |
| `git push`, `merge`, `cherry-pick`, `revert`, `rebase`, `pull` | dialog | dialog |
| `git switch -c agent/_ag__br_<name>` and every other command | not gated | not gated |

- The branch must **start with** `agent/_ag__br_` and have at least one character after it.
- The branch is tracked through a command chain, so `git switch -c agent/_ag__br_x && git commit` is judged on the new branch. A change is only trusted when the commands are joined by `&&`; after `;`, `||`, a pipe or a newline the branch is treated as unknown, because the switch may have failed.
- Unknown means gated: outside a repo, a detached HEAD, `--git-dir`, `GIT_DIR`, a path that cannot be resolved.
- The dialog states why it appeared. With no UI (print mode) a gated command is blocked.

It is a guard against accidents, not a security boundary. It does not see git aliases, scripts that call git internally, or another language's subprocess. `reset --hard`, `clean`, `checkout --`, `restore`, `stash drop` and `branch -D` are not gated: an accepted gap. It needs `git` on the `PATH` to read the branch; if it cannot, `add` and `commit` are gated.

## Base rules

`agent/SYSTEM.md` holds the rules that apply in every mode and nothing else:

- Zero sycophancy. No affirmations, no compliments, no filler. Facts only.
- Execution is trust-based. Run what was asked of you. Destructive commands only on explicit instruction.
- State only what you observed. Never claim a command ran, or a test passed, without the output in front of you.
- Never commit or stage except on an `agent/_ag__br_<name>` branch; `push`, `merge`, `cherry-pick`, `revert`, `rebase` and `pull` need operator approval at the gate.

Each mode's prompt is layered on top at runtime, so a switch takes effect on the next message. The reviewers will use the same base.

## Installation
Simply install pi coding agent through your preferred method, [see the website for further instructions](https://pi.dev/)

Once installed, before starting it up, create a .pi folder in home directory, then clone this repo into.

That's it!

## Recommended Tools
- [ddgr](https://github.com/jarun/ddgr)
- `git`, which the approval gate calls to read the current branch
- [helix](https://helix-editor.com/), which is what PiTor will open files in when it exists

## What is where

```
agent/
  SYSTEM.md                 base rules, every mode
  settings.json             pi settings (theme: guinness)
  modes/
    pical.md                PiCal prompt
    pina.md                 PiNa overlay
    pitor.md                PiTor prompt: the decided plan, marked not implemented
    pivez.md                empty on purpose
    piotrek.md              PiOtrek notes (not loaded)
    piotrek-reporting.md    analysis of PiOtrek worker reports (not loaded)
    pitor-requirements.md   the decided PiTor / PiTan / PiLing plan (not loaded)
  extensions/
    modes.ts                modes, /mode, /pina, prompt layering, read-only tools
    approval-gate.ts        the git gate
    terminal-prompt.ts      status line (path, mode, model, branch, quota) and editor styling
  lib/
    modes-registry.ts       the one place a mode is declared
    capabilities-panel.ts   the startup and mode-switch overview
  themes/                   guinness, automata
PROGRESS.md                 working notes for this configuration
```

## Known limitations

- PiTor, PiTan, PiLing and PiOtrek do not exist yet. Everything under them above is a plan.
- The mode, `/mode`, gate and status line behaviour was checked with scripted harnesses and a few probes of a real pi process. The approval dialog and the interactive popup have not been exercised end to end.
- The capabilities popup is 33 lines tall at 84 columns and does not scroll, so it clips on a shorter terminal.
- The reviewer spike used one model and one small diff; it shows the mechanism works, not how good the reviews are.
