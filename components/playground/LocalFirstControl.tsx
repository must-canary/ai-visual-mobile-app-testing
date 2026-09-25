"use client";

import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePlayground } from "@/components/playground/context";

export function LocalFirstControl() {
  const { state, actions } = usePlayground();

  return (
    <div className="flex items-center gap-2">
      <Tooltip>
        <TooltipTrigger
          render={
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <Switch
                checked={state.localFirst}
                onCheckedChange={(checked: boolean) => actions.setLocalFirst(checked)}
              />
              Local first
            </label>
          }
        />
        <TooltipContent>
          Reuse earlier resolutions from local history before calling vision
        </TooltipContent>
      </Tooltip>

      {state.cache ? (
        <Badge variant="secondary" className="font-mono text-[10px]">
          {state.cache.entries} saved · {state.cache.hits} hits
        </Badge>
      ) : null}

      <Button
        variant="ghost"
        size="sm"
        onClick={() => void actions.clearCache()}
        title="Clear local history"
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}
