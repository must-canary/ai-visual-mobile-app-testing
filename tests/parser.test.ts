import { describe, expect, it } from "vitest";
import { parseLine, parseScript } from "@/lib/dsl/parser";

describe("parser", () => {
  it("parses taps with every synonym", () => {
    for (const line of ["Tap on Receive", "Tap Receive", "Tap the Receive", "Click Receive", "Press Receive"]) {
      const step = parseLine(line, 0);
      expect(step?.kind).toBe("tap");
      expect(step && "target" in step ? step.target : null).toBe("Receive");
    }
  });

  it("parses typing with and without a field", () => {
    const withField = parseLine('Type "Buy milk" in the task title field', 3);
    expect(withField).toMatchObject({
      kind: "type",
      text: "Buy milk",
      field: "task title field",
      lineNo: 3,
    });

    const unquoted = parseLine("Type Buy milk into the search box", 0);
    expect(unquoted).toMatchObject({ kind: "type", text: "Buy milk", field: "search box" });

    const focused = parseLine('Type "hello"', 0);
    expect(focused).toMatchObject({ kind: "type", text: "hello", field: null });
  });

  it("parses validations with every synonym", () => {
    for (const verb of ["Validate that", "Verify", "Confirm that", "Check that", "Assert that"]) {
      const step = parseLine(`${verb} the balance is visible`, 0);
      expect(step?.kind).toBe("validate");
    }
  });

  it("parses every reusable mobile command and synonyms", () => {
    expect(parseLine("UNLOCK_IF_NEEDED", 4)).toMatchObject({
      kind: "unlockIfNeeded",
      lineNo: 4,
    });
    expect(parseLine('Wait Until "Save" is visible', 5)).toMatchObject({
      kind: "waitVisible",
      target: "Save",
      lineNo: 5,
    });
    for (const line of [
      "Long Press on message row",
      "Long-press the message row",
      "Press and hold on message row",
    ]) {
      expect(parseLine(line, 0)).toMatchObject({ kind: "longPress", target: "message row" });
    }
    for (const line of ['Select "Weekly" from frequency', "Choose 'Weekly' from the frequency"]) {
      expect(parseLine(line, 0)).toMatchObject({
        kind: "select",
        option: "Weekly",
        target: "frequency",
      });
    }
    expect(parseLine("Check newsletter checkbox", 0)).toMatchObject({
      kind: "check",
      target: "newsletter checkbox",
    });
    expect(parseLine("Uncheck the newsletter checkbox", 0)).toMatchObject({
      kind: "uncheck",
      target: "newsletter checkbox",
    });
    expect(parseLine("Clear the email field", 0)).toMatchObject({
      kind: "clear",
      target: "email field",
    });
    expect(parseLine('Press "ENTER"', 0)).toMatchObject({ kind: "pressKey", key: "ENTER" });
    expect(parseLine("Hide the Keyboard", 0)?.kind).toBe("hideKeyboard");
    expect(parseLine("Dismiss keyboard", 0)?.kind).toBe("hideKeyboard");
  });

  it("reports useful errors for malformed reusable commands", () => {
    const result = parseScript(
      'Wait Until Save is visible\nLong Press\nSelect Weekly from frequency\nPress "ENTER\nunlock_if_needed'
    );
    expect(result.errors).toHaveLength(5);
    expect(result.errors.map((error) => error.lineNo)).toEqual([0, 1, 2, 3, 4]);
    expect(result.errors[0].message).toMatch(/Wait Until/);
    expect(result.errors[1].message).toMatch(/Long Press/);
    expect(result.errors[2].message).toMatch(/Select/);
    expect(result.errors[3].message).toMatch(/Press/);
    expect(result.errors[4].message).toMatch(/uppercase/i);
  });

  it("parses scrolling, percentages and scroll-until", () => {
    expect(parseLine("Scroll down", 0)).toMatchObject({
      kind: "scroll",
      direction: "down",
      percent: 0.75,
    });
    expect(parseLine("Swipe up by 40%", 0)).toMatchObject({
      kind: "scroll",
      direction: "up",
      percent: 0.4,
    });
    expect(parseLine('Scroll down until "Total" is visible', 0)).toMatchObject({
      kind: "scrollUntil",
      direction: "down",
      target: "Total",
    });
    expect(parseLine("Slide down till Total is visible", 0)).toMatchObject({
      kind: "scrollUntil",
      target: "Total",
    });
  });

  it("parses waits", () => {
    expect(parseLine("Wait Until 20 Seconds", 0)).toMatchObject({ kind: "wait", seconds: 20 });
    expect(parseLine("wait 2s", 0)).toMatchObject({ kind: "wait", seconds: 2 });
  });

  it("parses system commands only in uppercase", () => {
    expect(parseLine("OPEN_APP", 0)).toMatchObject({ kind: "openApp", packageName: null });
    expect(parseLine("OPEN_APP com.example.myapp", 0)).toMatchObject({
      kind: "openApp",
      packageName: "com.example.myapp",
    });
    expect(parseLine("OPEN_APP Google Chrome", 0)).toMatchObject({
      kind: "openApp",
      packageName: "Google Chrome",
    });
    expect(parseLine("KILL_APP com.example.app", 0)).toMatchObject({
      kind: "killApp",
      packageName: "com.example.app",
    });
    expect(parseLine("CLEAR_APP", 0)?.kind).toBe("clearApp");
    expect(parseLine("MINIMIZE_APP", 0)?.kind).toBe("minimiseApp");
    expect(parseLine("MINIMISE_APP", 0)?.kind).toBe("minimiseApp");
    expect(parseLine("PRESS_DEVICE_BACK_BUTTON", 0)?.kind).toBe("back");
    expect(parseLine("open_app", 0)).toBeNull();
  });

  it("keeps comments and line numbers", () => {
    const result = parseScript("# first\n\nTap on Receive");
    expect(result.errors).toHaveLength(0);
    expect(result.steps[0]).toMatchObject({ kind: "comment", lineNo: 0 });
    expect(result.steps[1]).toMatchObject({ kind: "tap", lineNo: 2 });
  });

  it("collects every unparsable line with its number", () => {
    const result = parseScript("Tap on Receive\nfrobnicate the widget\nopen_app");
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0].lineNo).toBe(1);
    expect(result.errors[1].lineNo).toBe(2);
    expect(result.errors[1].message).toMatch(/uppercase/i);
  });
});
