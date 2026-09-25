"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { Play } from "lucide-react";
import { tokenize } from "@/lib/playground/highlight";
import { TOKEN_CLASS, STATUS_CLASS } from "@/lib/playground/palette";
import {
  isRunnable,
  parseIssuesByLine,
  scriptLines,
  statusByLine,
} from "@/lib/playground/dsl-lines";
import {
  CommandPalette,
  filterCommands,
  type CommandItem,
} from "@/components/playground/CommandPalette";
import { usePlayground } from "@/components/playground/context";

const LINE_HEIGHT = 24;
const PAD_TOP = 8;
const PAD_LEFT = 8;
const FONT =
  '13px/24px ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';

export function ScriptEditor({ onSave }: { onSave: () => void }) {
  const { state, actions } = usePlayground();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);

  const [scroll, setScroll] = useState({ top: 0, left: 0 });
  const [caretLine, setCaretLine] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteIndex, setPaletteIndex] = useState(0);
  const [paletteItems, setPaletteItems] = useState<CommandItem[]>([]);
  const [dismissedLine, setDismissedLine] = useState<number | null>(null);
  const [engaged, setEngaged] = useState(false);

  const lines = useMemo(() => scriptLines(state.script), [state.script]);
  const issues = useMemo(() => parseIssuesByLine(state.script), [state.script]);
  const statuses = useMemo(() => statusByLine(state.run.steps), [state.run.steps]);
  const activeLine =
    state.run.activeStepIndex !== null
      ? (state.run.steps[state.run.activeStepIndex]?.lineNo ?? null)
      : null;

  const running = state.run.status === "running";

  useEffect(() => {
    if (running) setPaletteOpen(false);
  }, [running]);

  const lineBounds = useCallback(
    (value: string, caret: number) => {
      const before = value.slice(0, caret);
      const start = before.lastIndexOf("\n") + 1;
      const endIndex = value.indexOf("\n", caret);
      const end = endIndex === -1 ? value.length : endIndex;
      return { start, end, index: before.split("\n").length - 1 };
    },
    []
  );

  const refreshPalette = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea || running) return;
    const { start, end, index } = lineBounds(textarea.value, textarea.selectionStart);
    setCaretLine(index);

    const lineText = textarea.value.slice(start, end);
    const uptoCaret = textarea.value.slice(start, textarea.selectionStart);
    const trimmed = uptoCaret.trim();

    if (dismissedLine === index) {
      setPaletteOpen(false);
      return;
    }

    const empty = lineText.trim().length === 0;
    const slash = trimmed.startsWith("/");
    const matches = trimmed.length > 0 ? filterCommands(trimmed) : filterCommands("");
    const prefixMatch =
      trimmed.length > 0 &&
      matches.length > 0 &&
      matches.some((item) =>
        item.label.toLowerCase().startsWith(trimmed.toLowerCase().replace(/^\//, ""))
      );

    if (empty || slash || prefixMatch) {
      setPaletteItems(matches);
      setPaletteIndex(0);
      setPaletteOpen(matches.length > 0);
      setEngaged(!empty);
    } else {
      setPaletteOpen(false);
    }
  }, [dismissedLine, lineBounds, running]);

  const insert = useCallback(
    (item: CommandItem) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const { start, end } = lineBounds(textarea.value, textarea.selectionStart);
      const next =
        textarea.value.slice(0, start) + item.snippet + textarea.value.slice(end);
      actions.setScript(next);
      setPaletteOpen(false);
      requestAnimationFrame(() => {
        const caret = start + item.caretOffset;
        textarea.focus();
        textarea.setSelectionRange(caret, caret);
      });
    },
    [actions, lineBounds]
  );

  const onKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    const mod = event.metaKey || event.ctrlKey;

    if (mod && event.key === "Enter") {
      event.preventDefault();
      void actions.runScript();
      return;
    }
    if (mod && event.key.toLowerCase() === "s") {
      event.preventDefault();
      onSave();
      return;
    }

    if (!paletteOpen) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setEngaged(true);
      setPaletteIndex((index) => (index + 1) % paletteItems.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setEngaged(true);
      setPaletteIndex(
        (index) => (index - 1 + paletteItems.length) % paletteItems.length
      );
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      insert(paletteItems[paletteIndex]);
      return;
    }
    if (event.key === "Enter" && engaged) {
      event.preventDefault();
      insert(paletteItems[paletteIndex]);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setPaletteOpen(false);
      setDismissedLine(caretLine);
    }
  };

  const syncScroll = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    setScroll({ top: textarea.scrollTop, left: textarea.scrollLeft });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <span className="text-xs font-medium">Script</span>
        <span className="text-[10px] text-muted-foreground">
          plain English · {lines.filter(isRunnable).length} steps
        </span>
        {issues.size > 0 ? (
          <span className="text-[10px] text-red-600">{issues.size} unknown line(s)</span>
        ) : null}
      </div>

      <div className="relative flex flex-1 overflow-hidden">
        <div className="w-16 shrink-0 overflow-hidden border-r bg-muted/40">
          <div style={{ transform: `translateY(${-scroll.top + PAD_TOP}px)` }}>
            {lines.map((line, index) => {
              const status = statuses.get(index);
              return (
                <div
                  key={index}
                  className="group flex items-center gap-1 pr-1 pl-2"
                  style={{ height: LINE_HEIGHT }}
                >
                  <span className="w-5 text-right font-mono text-[11px] text-muted-foreground">
                    {index + 1}
                  </span>
                  <span
                    className={`size-1.5 rounded-full ${
                      status ? STATUS_CLASS[status] : "bg-transparent"
                    }`}
                  />
                  {isRunnable(line) ? (
                    <button
                      type="button"
                      title="Run this line"
                      disabled={running || state.session.status !== "ready"}
                      onClick={() => void actions.runLine(index, line)}
                      className="ml-auto hidden text-muted-foreground hover:text-foreground group-hover:block disabled:opacity-40"
                    >
                      <Play className="size-3" />
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        <div className="relative flex-1 overflow-hidden">
          {activeLine !== null ? (
            <div
              className="pointer-events-none absolute inset-x-0 bg-sky-500/10"
              style={{
                height: LINE_HEIGHT,
                top: PAD_TOP + activeLine * LINE_HEIGHT - scroll.top,
              }}
            />
          ) : null}

          <pre
            ref={preRef}
            aria-hidden
            className="pointer-events-none absolute top-0 left-0 m-0 whitespace-pre"
            style={{
              font: FONT,
              tabSize: 2,
              padding: `${PAD_TOP}px ${PAD_LEFT}px`,
              transform: `translate(${-scroll.left}px, ${-scroll.top}px)`,
            }}
          >
            {lines.map((line, index) => {
              const issue = issues.get(index);
              return (
                <div
                  key={index}
                  style={{ height: LINE_HEIGHT }}
                  className={
                    issue
                      ? "underline decoration-red-500 decoration-wavy underline-offset-4"
                      : undefined
                  }
                  title={issue?.message}
                >
                  {line.length === 0
                    ? " "
                    : tokenize(line).map((token, tokenIndex) => (
                        <span key={tokenIndex} className={TOKEN_CLASS[token.type]}>
                          {token.value}
                        </span>
                      ))}
                </div>
              );
            })}
          </pre>

          <textarea
            ref={textareaRef}
            value={state.script}
            wrap="off"
            spellCheck={false}
            placeholder={"Tap on Receive\nValidate that the receive screen is visible"}
            onChange={(event) => {
              actions.setScript(event.target.value);
              setDismissedLine(null);
              requestAnimationFrame(refreshPalette);
            }}
            onKeyUp={refreshPalette}
            onClick={refreshPalette}
            onKeyDown={onKeyDown}
            onScroll={syncScroll}
            onBlur={() => setPaletteOpen(false)}
            className="absolute inset-0 size-full resize-none overflow-auto bg-transparent text-transparent caret-foreground outline-none placeholder:text-muted-foreground/60"
            style={{
              font: FONT,
              tabSize: 2,
              padding: `${PAD_TOP}px ${PAD_LEFT}px`,
            }}
          />

          {paletteOpen ? (
            <CommandPalette
              items={paletteItems}
              activeIndex={paletteIndex}
              onPick={insert}
              onHover={setPaletteIndex}
              style={{
                top: PAD_TOP + (caretLine + 1) * LINE_HEIGHT - scroll.top + 2,
                left: PAD_LEFT,
              }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
