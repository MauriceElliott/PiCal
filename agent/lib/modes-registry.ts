/**
 * Mode registry
 *
 * Single source for mode metadata. Imported by:
 *   - extensions/modes.ts        (prompt composition, /mode, /pina, status)
 *   - extensions/capabilities.ts (startup overview panel)
 *
 * Adding a mode here is the only place a mode needs to be declared. The prompt
 * body still lives in agent/modes/<file>.
 *
 * Top-level modes are PiCal, PiTor and PiVez. PiNa is an overlay to PiCal.
 * PiTan and PiLing are overlays to PiTor, spawn-only reviewer sessions, not
 * modes. PiOtrek is a layer above PiTor, not a mode, and is not implemented
 * (see agent/modes/piotrek.md). None of those three is declared here.
 */

export type ModeId = "pical" | "pitor" | "pivez";

export interface ModeDef {
  id: ModeId;
  label: string;
  /** Markdown file under agent/modes/. */
  file: string;
  /** Read-only modes hide write/edit and reject calls to them. */
  readOnly: boolean;
  status: "ready" | "not-implemented";
  summary: string;
  /** Nested capabilities shown in the startup panel. */
  capabilities: string[];
}

export const MODES: readonly ModeDef[] = [
  {
    id: "pical",
    label: "PiCal",
    file: "pical.md",
    readOnly: true,
    status: "ready",
    summary: "Read and research. You write the code.",
    capabilities: [
      "tutor — teaches by example, says how to find an answer rather than giving it",
      "rubber duck — restates the problem and asks the next question",
      "research — ddgr, docs, issue threads; links over prose",
      "read-only — no edits, no writes, no scaffolding; bash mutation left to you",
      "PiNa — Socratic overlay, off by default, /pina toggles",
    ],
  },
  {
    id: "pitor",
    label: "PiTor",
    file: "pitor.md",
    readOnly: false,
    status: "not-implemented",
    summary: "One feature, start to finish.",
    capabilities: [
      "phases — plan, design, implement, validate, adversarial review",
      "iterate — failures return to validation until it passes",
      "report — changes plus decisions and areas of lower certainty",
    ],
  },
  {
    id: "pivez",
    label: "PiVez",
    file: "pivez.md",
    readOnly: false,
    status: "ready",
    summary: "Open ended. Operator and model, all tools, no mode rules.",
    capabilities: [
      "open — no mode prompt, only the SYSTEM.md invariants",
      "all tools — write and edit available",
      "no overlay — PiNa does not apply",
    ],
  },
];

export const PINA_FILE = "pina.md";
export const WRITE_TOOLS: ReadonlySet<string> = new Set(["write", "edit"]);

export const DEFAULT_STATE: ModeState = { mode: "pical", pina: false };

export interface ModeState {
  mode: ModeId;
  pina: boolean;
}

export function modeDef(id: ModeId): ModeDef {
  return MODES.find((m) => m.id === id)!;
}

export function isModeId(value: unknown): value is ModeId {
  return typeof value === "string" && MODES.some((m) => m.id === value);
}

/** Replay "modes" entries from a session branch. Last write wins. */
export function readModeState(
  entries: readonly { type: string; customType?: string; data?: unknown }[],
): ModeState {
  let state: ModeState = { ...DEFAULT_STATE };
  for (const entry of entries) {
    if (entry.type !== "custom" || entry.customType !== "modes") continue;
    const data = entry.data as { mode?: unknown; pina?: unknown } | undefined;
    if (isModeId(data?.mode)) state.mode = data.mode;
    if (typeof data?.pina === "boolean") state.pina = data.pina;
  }
  return state;
}

export function statusText(state: ModeState): string {
  const d = modeDef(state.mode);
  const parts = [d.label];
  if (state.mode === "pical" && state.pina) parts.push("+ PiNa");
  if (d.status === "not-implemented") parts.push("(not implemented)");
  return parts.join(" ");
}
