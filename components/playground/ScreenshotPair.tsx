"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LocateOverlay } from "@/components/playground/LocateOverlay";
import type { LocateInfo } from "@/models/types";

type Shot = {
  label: string;
  url: string | null;
  locate?: LocateInfo;
};

function Thumb({ shot, onOpen }: { shot: Shot; onOpen: () => void }) {
  if (!shot.url) return null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex flex-col gap-1 text-left"
    >
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {shot.label}
      </span>
      <span className="relative block w-24 overflow-hidden rounded-md border transition group-hover:ring-2 group-hover:ring-ring">
        <img src={shot.url} alt={shot.label} className="block w-full" />
        {shot.locate ? <LocateOverlay locate={shot.locate} /> : null}
      </span>
    </button>
  );
}

export function ScreenshotPair({
  beforeUrl,
  afterUrl,
  locate,
}: {
  beforeUrl: string | null;
  afterUrl: string | null;
  locate?: LocateInfo;
}) {
  const [zoom, setZoom] = useState<Shot | null>(null);
  if (!beforeUrl && !afterUrl) return null;

  const before: Shot = { label: "before", url: beforeUrl, locate };
  const after: Shot = { label: "after", url: afterUrl };

  return (
    <>
      <div className="flex gap-3">
        <Thumb shot={before} onOpen={() => setZoom(before)} />
        <Thumb shot={after} onOpen={() => setZoom(after)} />
      </div>

      <Dialog open={zoom !== null} onOpenChange={(open: boolean) => !open && setZoom(null)}>
        <DialogContent className="max-w-[min(92vw,520px)]">
          <DialogHeader>
            <DialogTitle className="text-sm capitalize">
              {zoom?.label} screenshot
            </DialogTitle>
          </DialogHeader>
          {zoom?.url ? (
            <div className="relative overflow-hidden rounded-lg border">
              <img src={zoom.url} alt={zoom.label} className="block w-full" />
              {zoom.locate ? <LocateOverlay locate={zoom.locate} /> : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
