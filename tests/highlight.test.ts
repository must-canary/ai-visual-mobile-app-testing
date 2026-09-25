import { describe, expect, it } from "vitest";
import { reconstruct, tokenize } from "@/lib/playground/highlight";

describe("tokenizer", () => {
  it("reconstructs every line exactly", () => {
    const lines = [
      "Tap on Receive",
      'Type "Buy milk" in the task title field',
      "Scroll down by 40%",
      "KILL_APP tech.globalmpc.mpc_mining_app",
      "# a comment",
      "Wait Until 20 Seconds",
      "",
      "   indented   text  ",
    ];
    for (const line of lines) {
      expect(reconstruct(tokenize(line))).toBe(line);
    }
  });

  it("labels the token sequence of a tap", () => {
    expect(tokenize("Tap on Receive").map((token) => token.type)).toEqual([
      "action",
      "text",
      "connector",
      "text",
    ]);
  });

  it("marks quoted strings, numbers and directions", () => {
    const types = tokenize('Scroll down until "Total" is visible').map((t) => t.type);
    expect(types).toContain("action");
    expect(types).toContain("direction");
    expect(types).toContain("string");

    const percent = tokenize("Scroll up by 40%");
    expect(percent.some((token) => token.type === "number" && token.value === "40%")).toBe(
      true
    );
  });

  it("treats system commands and packages distinctly", () => {
    const tokens = tokenize("KILL_APP com.example.app");
    expect(tokens[0]).toMatchObject({ type: "system", value: "KILL_APP" });
    expect(tokens[2]).toMatchObject({ type: "package", value: "com.example.app" });
  });

  it("treats a whole comment line as one token", () => {
    expect(tokenize("# note here")).toEqual([{ value: "# note here", type: "comment" }]);
  });
});
