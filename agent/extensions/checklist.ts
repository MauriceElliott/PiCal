/**
 * Full-window interactive checklist.
 *
 * Opens a centered overlay that shows a list of sections, each containing
 * tickable items. Navigate with the keyboard or click an item to toggle it.
 *
 *   /checklist [path]
 *
 * When a path is given (default ~/.pi/todo.md), the file's markdown headings
 * become sections and its "- [ ]" items become checkboxes. Saving writes the
 * updated check marks back to the file.
 */

import type { ExtensionAPI, ExtensionUIContext, Theme } from "@mariozechner/pi-coding-agent";
import { type Focusable, matchesKey, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import type { TUI, TuiMouseEvent, TuiMouseEventResult } from "@mariozechner/pi-tui";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChecklistItem {
  label: string;
  checked: boolean;
}

interface ChecklistSection {
  title: string;
  items: ChecklistItem[];
}

type ChecklistResult = ChecklistSection[] | undefined;

// ─── Dialog ───────────────────────────────────────────────────────────────────

class ChecklistDialog implements Focusable {
  focused = false;

  private selected = 0;
  private scroll = 0;
  private entries: { section: number; item: number }[] = [];
  private rows: ({ kind: "header"; section: number } | { kind: "item"; entry: number })[] = [];
  private maxBody: number;
  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(
    private theme: Theme,
    private tui: TUI,
    private title: string,
    private sections: ChecklistSection[],
    private done: (result: ChecklistResult) => void,
  ) {
    for (let s = 0; s < sections.length; s++) {
      const section = sections[s]!;
      this.rows.push({ kind: "header", section: s });
      for (let i = 0; i < section.items.length; i++) {
        this.entries.push({ section: s, item: i });
        this.rows.push({ kind: "item", entry: this.entries.length - 1 });
      }
    }
    this.maxBody = Math.max(6, Math.floor(this.tui.terminal.rows * 0.7));
  }

  handleInput(data: string): void {
    if (matchesKey(data, "up") || matchesKey(data, "k")) {
      this.move(-1);
    } else if (matchesKey(data, "down") || matchesKey(data, "j")) {
      this.move(1);
    } else if (matchesKey(data, "pageUp")) {
      this.move(-Math.max(1, this.maxBody - 2));
    } else if (matchesKey(data, "pageDown")) {
      this.move(Math.max(1, this.maxBody - 2));
    } else if (matchesKey(data, "space") || matchesKey(data, "x")) {
      this.toggle();
    } else if (matchesKey(data, "enter")) {
      this.done(this.sections);
      return;
    } else if (matchesKey(data, "escape") || matchesKey(data, "q")) {
      this.done(undefined);
      return;
    } else {
      return;
    }
    this.invalidate();
  }

  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    if (event.type !== "click" || event.button !== "left") return undefined;

    const rowIndex = this.scroll + (event.y - 2);
    if (event.y >= 2 && rowIndex >= 0 && rowIndex < this.rows.length) {
      const row = this.rows[rowIndex]!;
      if (row.kind === "item") {
        this.selected = row.entry;
        this.toggle();
        this.invalidate();
      }
    }
    return { handled: true, focus: true };
  }

  private move(delta: number): void {
    if (this.entries.length === 0) return;
    this.selected = Math.max(0, Math.min(this.entries.length - 1, this.selected + delta));
    this.clampScroll();
  }

  private toggle(): void {
    const entry = this.entries[this.selected];
    if (!entry) return;
    const item = this.sections[entry.section]!.items[entry.item]!;
    item.checked = !item.checked;
  }

  private clampScroll(): void {
    const rowIndex = this.rows.findIndex((row) => row.kind === "item" && row.entry === this.selected);
    if (rowIndex < this.scroll) {
      this.scroll = rowIndex;
    } else if (rowIndex >= this.scroll + this.maxBody) {
      this.scroll = rowIndex - this.maxBody + 1;
    }
    this.scroll = Math.max(0, this.scroll);
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;

    const t = this.theme;
    const innerW = Math.max(1, width - 2);
    const lines: string[] = [];

    const row = (content: string): string => {
      const clipped = truncateToWidth(content, innerW);
      const w = visibleWidth(clipped);
      return t.fg("border", "│") + clipped + " ".repeat(Math.max(0, innerW - w)) + t.fg("border", "│");
    };

    // Top border with centered title.
    const title = ` ${this.title} `;
    const bl = Math.max(0, Math.floor((innerW - visibleWidth(title)) / 2));
    const br = Math.max(0, innerW - bl - visibleWidth(title));
    lines.push(
      t.fg("border", "╭" + "─".repeat(bl)) +
        t.fg("accent", title) +
        t.fg("border", "─".repeat(br) + "╮"),
    );
    lines.push(row(""));

    // Body.
    const visibleRows = this.rows.slice(this.scroll, this.scroll + this.maxBody);
    for (const r of visibleRows) {
      if (r.kind === "header") {
        const section = this.sections[r.section]!;
        lines.push(row("  " + t.bold(t.fg("accent", section.title || "(untitled)"))));
      } else {
        const entry = this.entries[r.entry]!;
        const item = this.sections[entry.section]!.items[entry.item]!;
        const isSel = r.entry === this.selected;
        const checkbox = item.checked
          ? t.fg(isSel ? "accent" : "success", "[x]")
          : t.fg(isSel ? "accent" : "dim", "[ ]");
        const prefix = isSel ? t.fg("accent", "▶ ") : "  ";
        const label = t.fg(isSel ? "accent" : "text", item.label);
        lines.push(row(prefix + checkbox + " " + label));
      }
    }
    for (let i = visibleRows.length; i < this.maxBody; i++) {
      lines.push(row(""));
    }

    // Help + bottom border.
    lines.push(row(""));
    const help = "↑↓ move • space/x toggle • enter save • q/esc cancel • click toggles";
    lines.push(row("  " + t.fg("dim", help)));
    lines.push(t.fg("border", "╰" + "─".repeat(innerW) + "╯"));

    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }

  dispose(): void {}
}

// ─── Markdown loading / saving ────────────────────────────────────────────────

interface LoadedTodo {
  path: string;
  fromFile: boolean;
  sections: ChecklistSection[];
  lines: string[];
  lineIndexByItem: Map<ChecklistItem, number>;
}

function loadTodo(path: string): LoadedTodo {
  if (existsSync(path)) {
    const lines = readFileSync(path, "utf8").split("\n");
    const sections: ChecklistSection[] = [];
    const lineIndexByItem = new Map<ChecklistItem, number>();
    let current: ChecklistSection = { title: "", items: [] };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const heading = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
      if (heading) {
        if (current.title !== "" || current.items.length > 0) sections.push(current);
        current = { title: heading[1]!, items: [] };
        continue;
      }
      const checkbox = /^\s*[-*+]\s+\[([ xX])\]\s*(.*)$/.exec(line);
      if (checkbox) {
        const item: ChecklistItem = {
          label: checkbox[2]!.trim() || "(untitled)",
          checked: checkbox[1]!.toLowerCase() === "x",
        };
        current.items.push(item);
        lineIndexByItem.set(item, i);
      }
    }
    if (current.title !== "" || current.items.length > 0) sections.push(current);

    return { path, fromFile: true, sections, lines, lineIndexByItem };
  }

  return {
    path,
    fromFile: false,
    sections: structuredClone(SAMPLE_SECTIONS),
    lines: [],
    lineIndexByItem: new Map(),
  };
}

function saveTodo(todo: LoadedTodo, sections: ChecklistSection[]): void {
  const { lines, lineIndexByItem } = todo;
  for (const section of sections) {
    for (const item of section.items) {
      const lineIndex = lineIndexByItem.get(item);
      if (lineIndex === undefined) continue;
      const marker = item.checked ? "[x]" : "[ ]";
      lines[lineIndex] = lines[lineIndex]!.replace(/\[[ xX]\]/, marker);
    }
  }
  writeFileSync(todo.path, lines.join("\n"));
}

const SAMPLE_SECTIONS: ChecklistSection[] = [
  {
    title: "Project setup",
    items: [
      { label: "Install dependencies", checked: true },
      { label: "Configure environment", checked: false },
    ],
  },
  {
    title: "Features",
    items: [
      { label: "Build the checklist overlay", checked: true },
      { label: "Add click-to-toggle", checked: false },
      { label: "Persist to markdown", checked: false },
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function showChecklist(
  ui: ExtensionUIContext,
  title: string,
  sections: ChecklistSection[],
): Promise<ChecklistResult> {
  return ui.custom<ChecklistResult>(
    (tui, theme, _kb, done) => {
      const dialog = new ChecklistDialog(theme, tui, title, sections, done);
      dialog.focused = true;
      return dialog;
    },
    {
      overlay: true,
      overlayOptions: { anchor: "center", width: "90%", minWidth: 60, maxHeight: "95%" },
    },
  );
}

function resolvePath(args: string, cwd: string): string {
  const trimmed = args.trim();
  if (trimmed === "") return join(homedir(), ".pi", "todo.md");
  return isAbsolute(trimmed) ? trimmed : resolve(cwd, trimmed);
}

// ─── Extension ────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  pi.registerCommand("checklist", {
    description: "Open a full-window checklist (sections ticked off from a markdown file)",
    async handler(args, ctx) {
      if (!ctx.hasUI) return;

      const path = resolvePath(args, ctx.cwd);
      const todo = loadTodo(path);
      const title = todo.fromFile ? `Checklist — ${path}` : "Checklist (sample)";

      const result = await showChecklist(ctx.ui, title, todo.sections);

      if (result && todo.fromFile) {
        saveTodo(todo, result);
        ctx.ui.notify("Checklist saved");
      }
    },
  });
}
