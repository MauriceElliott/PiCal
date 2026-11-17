/**
 * Modes
 *
 * Sole author of the system prompt.
 *
 * Composition:
 *   event.systemPrompt   ← SYSTEM.md invariants, rendered by pi
 * + agent/modes/<mode>.md
 * + agent/modes/pina.md  ← only when mode is "pical" and PiNa is on
 * + PiTor run section    ← only when mode is "pitor" (lib/pitor-state.ts)
 *
 * State is per-branch: appended with pi.appendEntry("modes", { mode, pina })
 * and restored from ctx.sessionManager.getBranch() on session_start, so a
 * resumed session keeps its mode. New sessions start at PiCal, PiNa off.
 */

import type {
  ExtensionAPI,
  ExtensionContext,
  ToolCallEvent,
  ToolInfo,
} from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_STATE,
  isModeId,
  MODES,
  modeDef,
  type ModeState,
  PINA_FILE,
  readModeState,
  statusText,
  WRITE_TOOLS,
} from "../lib/modes-registry";
import { CapabilitiesPanel } from "../lib/capabilities-panel";
import { runIntake } from "../lib/pitor-intake";
import { PITOR_TOOLS, pitorPromptSection, readPitorState } from "../lib/pitor-state";

const AGENT_DIR = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
const MODES_DIR = join(AGENT_DIR, "modes");
const STATE_KEY = "modes";

// ── State ────────────────────────────────────────────────────────────────────

let state: ModeState = { ...DEFAULT_STATE };

/**
 * Set by /mode just before it starts a new session, read once by the next
 * session_start. Module state survives ctx.newSession (the factory runs again
 * but the module is not reloaded), so this tells a mode switch apart from a
 * plain /new, which does not show the overview.
 */
let overviewOnNext = false;

const promptCache = new Map<string, string>();

/** Markdown body for a file in agent/modes, empty string if it is missing. */
function promptFor(file: string): string {
  const cached = promptCache.get(file);
  if (cached !== undefined) return cached;
  let text = "";
  try {
    text = readFileSync(join(MODES_DIR, file), "utf8").trim();
  } catch {
    text = "";
  }
  promptCache.set(file, text);
  return text;
}

/** Every tool pi has registered and will actually expose to the model. */
function baseToolNames(pi: ExtensionAPI): string[] {
  return pi
    .getAllTools()
    .filter((t: ToolInfo) => t.exposure !== "hidden")
    .map((t: ToolInfo) => t.name);
}

function applyTools(pi: ExtensionAPI): void {
  let base = baseToolNames(pi);
  // PiTor's flow tools exist only in PiTor.
  if (state.mode !== "pitor") base = base.filter((n) => !PITOR_TOOLS.has(n));
  pi.setActiveTools(modeDef(state.mode).readOnly ? base.filter((n) => !WRITE_TOOLS.has(n)) : base);
}

function refreshStatus(ctx: ExtensionContext): void {
  ctx.ui.setStatus("modes", statusText(state));
}

function persist(pi: ExtensionAPI): void {
  pi.appendEntry(STATE_KEY, { mode: state.mode, pina: state.pina });
}

function restore(ctx: ExtensionContext): void {
  state = readModeState(ctx.sessionManager.getBranch());
}

/** True once this branch has an explicit mode/PiNa decision of its own. */
function hasDecision(ctx: ExtensionContext): boolean {
  return ctx.sessionManager
    .getBranch()
    .some((entry) => entry.type === "custom" && entry.customType === STATE_KEY);
}

async function showCapabilities(ctx: ExtensionContext): Promise<void> {
  await ctx.ui.custom<void>(
    (_tui, theme, _kb, done) => {
      const panel = new CapabilitiesPanel(theme, state, () => done(undefined));
      panel.focused = true;
      return panel;
    },
    {
      overlay: true,
      overlayOptions: { width: "90%", minWidth: 60, maxWidth: 84, maxHeight: "95%" },
    },
  );
}

// ── Extension ────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (event, ctx) => {
    const afterModeSwitch = overviewOnNext;
    overviewOnNext = false;
    restore(ctx);
    applyTools(pi);
    refreshStatus(ctx);

    if (!ctx.hasUI) return;
    if (event.reason !== "startup" && event.reason !== "new") return;

    // 1. Overview: on the first screen of a process, and after a mode switch.
    if (event.reason === "startup" || (event.reason === "new" && afterModeSwitch)) {
      await showCapabilities(ctx);
    }

    // 2. PiTor: intake, once per session, after the overview.
    if (state.mode === "pitor") {
      if (!readPitorState(ctx.sessionManager.getBranch()).phase) await runIntake(pi, ctx);
      return;
    }

    // 3. The PiNa question, once per branch, PiCal only.
    if (state.mode !== "pical" || hasDecision(ctx)) return;

    const enable = await ctx.ui.confirm(
      "PiNa",
      "Enable PiNa, the Socratic overlay? PiCal will ask before it answers. /pina toggles it later.",
    );
    if (!enable) return;

    state = { ...state, pina: true };
    persist(pi);
    refreshStatus(ctx);
  });

  pi.on("tool_call", async (event: ToolCallEvent) => {
    if (!modeDef(state.mode).readOnly) return undefined;
    if (!WRITE_TOOLS.has(event.toolName)) return undefined;
    return {
      block: true,
      reason: `${modeDef(state.mode).label} is read-only: ${event.toolName} is unavailable.`,
    };
  });

  pi.on("before_agent_start", async (event, ctx) => {
    const sections = [event.systemPrompt.trim()];

    const modePrompt = promptFor(modeDef(state.mode).file);
    if (modePrompt) sections.push(modePrompt);

    // PiTor: where the run is and what to do now. Rebuilt every run from the
    // session's "pitor" entries, so a phase change shows on the next message.
    if (state.mode === "pitor") {
      sections.push(pitorPromptSection(readPitorState(ctx.sessionManager.getBranch())));
    }

    // PiNa is a PiCal-only overlay. It narrows PiCal, never replaces it.
    if (state.mode === "pical" && state.pina) {
      const pinaPrompt = promptFor(PINA_FILE);
      if (pinaPrompt) sections.push(pinaPrompt);
    }

    return { systemPrompt: sections.join("\n\n---\n\n") };
  });

  pi.registerCommand("mode", {
    description: "Switch mode (starts a new session): pical | pitor | pivez. No argument lists modes.",
    handler: async (args, ctx) => {
      const want = args.trim().toLowerCase();

      if (!want) {
        const lines = MODES.map((m) => {
          const flag = m.id === state.mode ? "*" : " ";
          const mark = m.status === "not-implemented" ? " [not implemented]" : "";
          return `${flag} ${m.id.padEnd(9)}${mark} ${m.summary}`;
        });
        ctx.ui.notify(lines.join("\n"), "info");
        return;
      }

      if (!isModeId(want)) {
        ctx.ui.notify(
          `Unknown mode "${want}". Available: ${MODES.map((m) => m.id).join(", ")}`,
          "error",
        );
        return;
      }
      if (want === state.mode) {
        ctx.ui.notify(`Already in ${modeDef(want).label}.`, "info");
        return;
      }

      // A mode switch clears context: it starts a new session in the target
      // mode. The handler's own ctx is stale once the session is replaced, so
      // anything after the switch goes through the replacement context.
      //
      // PiTor and PiVez get their mode written into the new session before it
      // starts. PiCal gets no entry, exactly like /new, so the new session
      // asks the PiNa question again: that is how PiNa is turned on or off if
      // it was chosen wrongly at launch. The capabilities overview is shown
      // first in every case.
      const def = modeDef(want);
      const note = def.status === "not-implemented" ? " — not implemented" : "";
      overviewOnNext = true;
      const result = await ctx.newSession({
        setup:
          want === "pical"
            ? undefined
            : async (sm) => {
                sm.appendCustomEntry(STATE_KEY, { mode: want, pina: false });
              },
        withSession: async (rctx) => {
          rctx.ui.notify(`Mode: ${def.label}${note}. New session, previous context not carried over.`, "info");
        },
      });
      if (result.cancelled) {
        overviewOnNext = false;
        ctx.ui.notify("Mode switch cancelled.", "info");
      }
    },
  });

  pi.registerCommand("pina", {
    description: "Toggle PiNa, the Socratic overlay, within PiCal.",
    handler: async (args, ctx) => {
      const want = args.trim().toLowerCase();
      if (want && want !== "on" && want !== "off") {
        ctx.ui.notify("Usage: /pina, /pina on, /pina off", "error");
        return;
      }
      if (state.mode !== "pical") {
        ctx.ui.notify(`PiNa applies to PiCal only (current mode: ${modeDef(state.mode).label}).`, "warning");
        return;
      }

      const next = want === "on" ? true : want === "off" ? false : !state.pina;
      if (next === state.pina) {
        ctx.ui.notify(`PiNa already ${state.pina ? "on" : "off"}.`, "info");
        return;
      }

      state = { ...state, pina: next };
      persist(pi);
      refreshStatus(ctx);
      ctx.ui.notify(next ? "PiNa on. Socratic overlay active." : "PiNa off.", "info");
    },
  });
}
