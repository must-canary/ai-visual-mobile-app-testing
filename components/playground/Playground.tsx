"use client";

import { useState } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { PlaygroundProvider, usePlayground } from "@/components/playground/context";
import { SessionBar } from "@/components/playground/SessionBar";
import { ScriptEditor } from "@/components/playground/ScriptEditor";
import { ExecutionLog } from "@/components/playground/ExecutionLog";
import { DevicePanel } from "@/components/playground/DevicePanel";
import { TestsSidebar } from "@/components/playground/TestsSidebar";
import { SaveTestDialog } from "@/components/playground/SaveTestDialog";

function Workspace() {
  const { state, actions } = usePlayground();
  const [sidebar, setSidebar] = useState(true);
  const [saveOpen, setSaveOpen] = useState(false);

  const save = () => {
    if (state.currentTest) void actions.saveTest();
    else setSaveOpen(true);
  };

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-2 border-b px-3 py-2">
        <Button variant="ghost" size="sm" onClick={() => setSidebar((open) => !open)}>
          {sidebar ? (
            <PanelLeftClose className="size-4" />
          ) : (
            <PanelLeftOpen className="size-4" />
          )}
        </Button>
        <h1 className="text-sm font-semibold">Visual Mobile Testing</h1>
        <span className="text-[11px] text-muted-foreground">
          plain English steps · vision resolves the coordinates
        </span>
      </header>

      <div className="flex min-h-0 flex-1">
        {sidebar ? (
          <div className="w-56 shrink-0">
            <TestsSidebar />
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col">
          <SessionBar onSave={save} />

          <div className="min-h-0 flex-1">
            <ResizablePanelGroup orientation="horizontal" className="h-full">
              <ResizablePanel defaultSize={36} minSize={20}>
                <ScriptEditor onSave={save} />
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={36} minSize={20}>
                <ExecutionLog />
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={28} minSize={15}>
                <DevicePanel />
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>
        </div>
      </div>

      <SaveTestDialog
        open={saveOpen}
        defaultName={state.currentTest?.name ?? ""}
        onOpenChange={setSaveOpen}
        onConfirm={(name) => {
          setSaveOpen(false);
          void actions.saveTest(name);
        }}
      />
    </div>
  );
}

export function Playground() {
  return (
    <PlaygroundProvider>
      <Workspace />
    </PlaygroundProvider>
  );
}
