"use client";

import { useState } from "react";
import { FilePlus2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { usePlayground } from "@/components/playground/context";
import type { TestDto } from "@/models/types";

export function TestsSidebar() {
  const { state, actions } = usePlayground();
  const [pendingOpen, setPendingOpen] = useState<TestDto | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TestDto | null>(null);

  const appName = (appId: string) =>
    state.apps.find((app) => app.id === appId)?.name ?? "unknown app";

  const open = (test: TestDto) => {
    if (!state.saved && state.script.trim().length > 0) setPendingOpen(test);
    else actions.openTest(test);
  };

  return (
    <div className="flex h-full flex-col border-r">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <span className="text-xs font-medium">Tests</span>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => actions.newTest()}
        >
          <FilePlus2 className="size-3.5" />
          New
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-1 p-2">
          {state.tests.length === 0 ? (
            <p className="px-1 text-[11px] text-muted-foreground">No saved tests yet.</p>
          ) : (
            state.tests.map((test) => (
              <div
                key={test.id}
                className={`group flex items-center gap-1 rounded-md px-2 py-1.5 hover:bg-accent ${
                  state.currentTest?.id === test.id ? "bg-accent" : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() => open(test)}
                  className="flex-1 text-left"
                >
                  <span className="block truncate text-xs font-medium">{test.name}</span>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {appName(test.appId)} · {new Date(test.updatedAt).toLocaleDateString()}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setPendingDelete(test)}
                  className="hidden text-muted-foreground hover:text-red-600 group-hover:block"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      <AlertDialog
        open={pendingOpen !== null}
        onOpenChange={(open: boolean) => !open && setPendingOpen(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              The current script has changes that have not been saved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingOpen) actions.openTest(pendingOpen);
                setPendingOpen(null);
              }}
            >
              Discard and open
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open: boolean) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this test?</AlertDialogTitle>
            <AlertDialogDescription>
              This also deletes its runs and their screenshots.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) void actions.deleteTest(pendingDelete.id);
                setPendingDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
