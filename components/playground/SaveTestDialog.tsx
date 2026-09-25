"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export function SaveTestDialog({
  open,
  defaultName,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  defaultName: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (name: string) => void;
}) {
  const [name, setName] = useState(defaultName);

  return (
    <Dialog
      open={open}
      onOpenChange={(next: boolean) => {
        if (next) setName(defaultName);
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">Save test</DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          value={name}
          placeholder="Receive flow"
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && name.trim()) {
              onConfirm(name.trim());
            }
          }}
        />
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={name.trim().length === 0}
            onClick={() => onConfirm(name.trim())}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
