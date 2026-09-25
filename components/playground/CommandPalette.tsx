"use client";

import type { CSSProperties } from "react";
import { COMMAND_LABELS } from "@/lib/dsl/commands";

export type CommandItem = (typeof COMMAND_LABELS)[number];

export function filterCommands(prefix: string): CommandItem[] {
  const needle = prefix.trim().toLowerCase().replace(/^\//, "");
  if (needle.length === 0) return COMMAND_LABELS;
  return COMMAND_LABELS.filter(
    (item) =>
      item.label.toLowerCase().startsWith(needle) ||
      item.kind.toLowerCase().startsWith(needle) ||
      item.label.toLowerCase().includes(needle)
  );
}

export function CommandPalette({
  items,
  activeIndex,
  style,
  onPick,
  onHover,
}: {
  items: CommandItem[];
  activeIndex: number;
  style: CSSProperties;
  onPick: (item: CommandItem) => void;
  onHover: (index: number) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div
      style={style}
      className="absolute z-30 max-h-60 w-[340px] overflow-auto rounded-lg border bg-popover p-1 shadow-lg"
    >
      {items.map((item, index) => (
        <button
          key={item.kind}
          type="button"
          onMouseEnter={() => onHover(index)}
          onMouseDown={(event) => {
            event.preventDefault();
            onPick(item);
          }}
          className={`flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left ${
            index === activeIndex ? "bg-accent text-accent-foreground" : ""
          }`}
        >
          <span className="font-mono text-xs font-medium">{item.usage}</span>
          <span className="text-[10px] text-muted-foreground">{item.description}</span>
        </button>
      ))}
    </div>
  );
}
