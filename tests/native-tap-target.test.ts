import { describe, expect, it, vi } from "vitest";
import {
  matchNativeTarget,
  resolveNativeTap,
  type AppiumDriver,
} from "@/lib/appium/gestures";

// Mirrors the real Receive-screen hierarchy: Compose surfaces expose the
// buttons as clickable ImageViews carrying only a content-desc. No address.
const RECEIVE_SOURCE = `<?xml version="1.0" encoding="UTF-8"?>
<hierarchy rotation="0">
  <android.widget.FrameLayout bounds="[0,0][1080,2400]" clickable="false" enabled="true">
    <android.widget.ImageView content-desc="" bounds="[53,100][126,173]" clickable="true" enabled="true" displayed="true" />
    <android.view.View content-desc="Receive MPC" bounds="[0,180][1080,260]" clickable="false" enabled="true" displayed="true" />
    <android.widget.ImageView content-desc="Copy address" bounds="[108,1255][972,1386]" clickable="true" enabled="true" displayed="true" />
    <android.widget.ImageView content-desc="Share address" bounds="[108,1428][972,1544]" clickable="true" enabled="true" displayed="true" />
  </android.widget.FrameLayout>
</hierarchy>`;

// The exact point the visual locator produced on the real device.
const VISION_POINT = { x: 381, y: 2069 };

describe("native tap target association", () => {
  it("corrects a visual point that falls outside the element it named", () => {
    const match = matchNativeTarget(RECEIVE_SOURCE, "Copy address", VISION_POINT);

    expect(match).not.toBeNull();
    // Centre of [108,1255][972,1386]: 1320.5 rounds to 1321
    expect(match?.x).toBe(540);
    expect(match?.y).toBe(1321);
    expect(match?.label).toBe("Copy address");
  });

  it("leaves the visual point alone when it is already on the element", () => {
    expect(
      matchNativeTarget(RECEIVE_SOURCE, "Copy address", { x: 540, y: 1320 })
    ).toBeNull();
    // Edges count as on-target too.
    expect(
      matchNativeTarget(RECEIVE_SOURCE, "Copy address", { x: 108, y: 1255 })
    ).toBeNull();
  });

  it("matches the label loosely so a described target still resolves", () => {
    const match = matchNativeTarget(
      RECEIVE_SOURCE,
      'the "Copy address" button',
      VISION_POINT
    );
    expect(match?.y).toBe(1321);
  });

  it("keeps Copy address and Share address distinct", () => {
    expect(matchNativeTarget(RECEIVE_SOURCE, "Share address", VISION_POINT)?.y).toBe(1486);
    expect(matchNativeTarget(RECEIVE_SOURCE, "Copy address", VISION_POINT)?.y).toBe(1321);
  });

  it("returns null when no native element carries the label", () => {
    expect(matchNativeTarget(RECEIVE_SOURCE, "Receive", VISION_POINT)).toBeNull();
    expect(matchNativeTarget(RECEIVE_SOURCE, "Send", VISION_POINT)).toBeNull();
  });

  it("refuses to guess when two clickable elements share the label", () => {
    const ambiguous = `<hierarchy>
      <android.widget.ImageView content-desc="Copy address" bounds="[0,100][200,200]" clickable="true" enabled="true" displayed="true" />
      <android.widget.ImageView content-desc="Copy address" bounds="[0,400][200,500]" clickable="true" enabled="true" displayed="true" />
    </hierarchy>`;
    expect(matchNativeTarget(ambiguous, "Copy address", VISION_POINT)).toBeNull();
  });

  it("ignores elements that are not clickable, not enabled, or not displayed", () => {
    const inert = `<hierarchy>
      <android.view.View content-desc="Copy address" bounds="[108,1255][972,1386]" clickable="false" enabled="true" displayed="true" />
      <android.widget.ImageView content-desc="Copy address" bounds="[108,1600][972,1700]" clickable="true" enabled="false" displayed="true" />
      <android.widget.ImageView content-desc="Copy address" bounds="[108,1800][972,1900]" clickable="true" enabled="true" displayed="false" />
    </hierarchy>`;
    expect(matchNativeTarget(inert, "Copy address", VISION_POINT)).toBeNull();
  });

  it("survives malformed bounds and empty source without throwing", () => {
    expect(
      matchNativeTarget(
        `<hierarchy><android.widget.ImageView content-desc="Copy address" bounds="garbage" clickable="true" enabled="true" /></hierarchy>`,
        "Copy address",
        VISION_POINT
      )
    ).toBeNull();
    expect(matchNativeTarget("", "Copy address", VISION_POINT)).toBeNull();
    expect(matchNativeTarget(RECEIVE_SOURCE, "", VISION_POINT)).toBeNull();
  });

  it("reads the page source through the driver and returns the corrected point", async () => {
    const driver = {
      getPageSource: vi.fn().mockResolvedValue(RECEIVE_SOURCE),
    } as unknown as AppiumDriver;

    const match = await resolveNativeTap(driver, VISION_POINT, "Copy address");

    expect(match).toEqual(
      expect.objectContaining({ x: 540, y: 1321, label: "Copy address" })
    );
  });

  it("falls back to the visual point when page source is unavailable", async () => {
    const driver = {
      getPageSource: vi.fn().mockRejectedValue(new Error("not supported")),
    } as unknown as AppiumDriver;

    expect(await resolveNativeTap(driver, VISION_POINT, "Copy address")).toBeNull();
    expect(await resolveNativeTap(driver, VISION_POINT, null)).toBeNull();
  });
});
