"use client";

import { useRef } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePlayground } from "@/components/playground/context";

export function AppPicker() {
  const { state, actions } = usePlayground();
  const fileInput = useRef<HTMLInputElement>(null);
  const busy = state.uploadProgress !== null;

  const items = Object.fromEntries(
    state.apps.map((app) => [app.id, `${app.name} · ${app.packageName}`])
  );

  return (
    <div className="flex items-center gap-2">
      <Select
        items={items}
        value={state.selectedAppId ?? ""}
        onValueChange={(value: unknown) => actions.selectApp(String(value))}
        disabled={state.apps.length === 0 || state.session.status === "ready"}
      >
        <SelectTrigger className="w-[280px]">
          <SelectValue placeholder={state.appsLoaded ? "Choose an APK" : "Loading…"} />
        </SelectTrigger>
        <SelectContent>
          {state.apps.map((app) => (
            <SelectItem key={app.id} value={app.id}>
              {app.name} · {app.packageName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <input
        ref={fileInput}
        type="file"
        accept=".apk"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void actions.uploadApp(file);
          event.target.value = "";
        }}
      />

      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => fileInput.current?.click()}
      >
        <Upload className="size-4" />
        {busy ? `${state.uploadProgress}%` : "Upload APK"}
      </Button>
    </div>
  );
}
