# PiCal
PiCal is my own personal agent harness, its main focus is to support my workflow. I generally like to code by hand, so the default state is PiCal, but it has other modes like PiNa which is a Socratic tutor layer for PiCal, then PiTor, which is a one shot feature mode with a rigerous planning and review phase. There other modes as well, feel free to try them out, fork this project to extend, or just pick a particular mode that strikes your fancy. The objective with this is to match your needs and prefered workflow, not mould yourself to fit the needs of an agentic workflow. 

## PiCal (mode)

PiCal (pronounced Pee-Cal) is a Pi configuration designed to stop your skills atrophying while still offering you the following benefits:
- An on the job tutor
- A Rubber duck
- A quick reference
- A stack overflow and github issues crawler
- A incompetent researcher
- A Let me Google That for You-er

It is designed with 1 simple goal, help your thinking instead of doing it for you. The cal in PiCal is from Cal Newport, the writer of DeepWork, and Digital Minimalism, both of which implore readers take head space, think for themselves, and to not become another money bag for the attention economy.

### PiNa (overlay)

PiNa (pronounced Pee-Na) is an overlay on PiCal for when you want to be taught a topic properly, offering you the following on top:
- A diagnostic to find out what you already know
- A skill map, levels 0 to 5, that you have to earn
- One question at a time, and no answers handed over
- Spaced review of things you thought you had nailed
- A final exam

Based on this skill from [jane street](https://github.com/janestreet/agent_skills/blob/master/socratic-tutor/SKILL.md)

## PiTor (mode)

PiTor (prounced Peter) is a mode designed for full feature creation, i.e. spec, design, to plan, to implementation to review.
It is essentially designed to be a worker, I'm looking at this with the intent of it have a **mid tier** model, something like a sonnet or deepseek flash. It will eventually be used by the orchestrator mode PiOtrek. It has a review with context by a second model, and then a review without context in an adversarial capacity with another model.
To use it, enter the mode with a clean work tree, i.e. commit or stash any existing changes include untracked files. If you forget to the this, once in the mode start it using /pitor. 

## PiVez (mode/modeless)

PiVez (pronounced Peeves) is a mode that only has the base rules applied, i.e. no sychophancy, brain dead code etc.

## PiOtrek (mode, not implemented)

PiOtrek (pronounced Pee-Ot-rek) will sit above PiTor and run PiTor agents for you. It waits until PiTor is solid; notes are in [`agent/modes/piotrek.md`](agent/modes/piotrek.md).

## Commands

| Command | What it does |
|---|---|
| `/mode` | Lists the modes |
| `/mode pical`, `/mode pitor`, `/mode pivez` | Switches mode. This starts a new session, the conversation doesn't come with you |
| `/pina` | Turns PiNa on or off, PiCal only |
| `/pitor` | Shows the PiTor run, or starts its intake if that didn't finish |
| `/new` | Fresh session, back to PiCal |

On startup an overview panel lists the modes. Up/down picks one, Enter accepts it.

The current mode is on the status line above the editor, and in PiTor so is the phase.

## Rules

These apply in every mode:
- Brain dead code: simple enough to understand at 4am half asleep. No single-use functions, no speculative abstraction, no comments the code could say itself, no array-then-loop unless it saves 10 lines. PiLing flags violations.
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
