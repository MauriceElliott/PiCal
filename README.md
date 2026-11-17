# PiCal

PiCal is a Pi configuration designed to stop your skills atrophying while still offering you the following benefits:
- An on the job tutor
- A Rubber duck
- A quick reference
- A stack overflow and github issues crawler
- A incompetent researcher
- A Let me Google That for You-er

It is designed with 1 simple goal, help your thinking instead of doing it for you. The cal in PiCal is from Cal Newport, the writer of DeepWork, and Digital Minimalism, both of which implore readers take head space, think for themselves, and to not become another money bag for the attention economy.

### PiNa

PiNa is an overlay on PiCal for when you want to be taught a topic properly, offering you the following on top:
- A diagnostic to find out what you already know
- A skill map, levels 0 to 5, that you have to earn
- One question at a time, and no answers handed over
- Spaced review of things you thought you had nailed
- A final exam

It is designed with 1 simple goal, make you prove you know it. It is off by default; PiCal asks whether you want it when it starts, and `/pina` turns it on or off. It only kicks in when you ask to be taught ("teach me", "quiz me", "drill me"), a one-off question still gets a normal answer.

## PiTor

PiTor is the mode for when you do want the work done, one feature at a time, while still offering you the following benefits:
- A design partner
- A planner
- A one shot implementer, working on its own `agent/_ag__br_<name>` branch
- Two reviewers from a different model family than the author, PiTan (who has the author's context) and PiLing (who doesn't)
- A hand-off of the changes, the decisions, and the bits it is least sure of, ready to open in helix

It is designed with 1 simple goal, do the work without taking the decisions away from you. You give it the acceptance criteria, you approve the design and the plan, it comes back to you when it gets stuck, and you merge. Switch to it with `/mode pitor` inside a git repository with a clean work tree; it asks for the feature, the acceptance criteria and the reviewer model, then works through design, plan, implement, validate, review and present. `/pitor` shows where the run is. The full spec is in [`agent/modes/pitor-requirements.md`](agent/modes/pitor-requirements.md).

## PiVez

PiVez is the way out of any mode, offering you the following:
- No mode rules
- All the tools
- Nothing but the base rules

It is designed with 1 simple goal, get out of the way.

## PiOtrek (not a mode, not implemented)

PiOtrek will sit above PiTor and run PiTor agents for you. It waits until PiTor is solid; notes are in [`agent/modes/piotrek.md`](agent/modes/piotrek.md).

## Commands

| Command | What it does |
|---|---|
| `/mode` | Lists the modes |
| `/mode pical`, `/mode pitor`, `/mode pivez` | Switches mode. This starts a new session, the conversation doesn't come with you |
| `/pina` | Turns PiNa on or off, PiCal only |
| `/pitor` | Shows the PiTor run, or starts its intake if that didn't finish |
| `/new` | Fresh session, back to PiCal |

The current mode is on the status line above the editor, and in PiTor so is the phase.

## Rules

These apply in every mode:
- Zero sycophancy. No affirmations, no compliments, no filler. Facts only.
- Execution is trust-based. Destructive commands only when asked.
- It only states what it actually saw, no "the tests pass" without the output.
- No commits except on an `agent/_ag__br_<name>` branch.

There is one approval gate, and it is for git. In PiCal `git add` and `git commit` are refused outright. In the other modes they are allowed on an `agent/_ag__br_<name>` branch and need your approval anywhere else. `git push`, `merge`, `cherry-pick`, `revert`, `rebase` and `pull` always need your approval. It is there to catch accidents, not to be a security boundary.

## Installation
Simply install pi coding agent through your preferred method, [see the website for further instructions](https://pi.dev/)

Once installed, before starting it up, create a .pi folder in home directory, then clone this repo into.

That's it!

## Recommended Tools
- [ddgr](https://github.com/jarun/ddgr)
- [helix](https://helix-editor.com/), for PiTor's hand-off
