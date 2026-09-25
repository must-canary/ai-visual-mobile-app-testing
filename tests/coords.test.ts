import { describe, expect, it } from "vitest";
import { CoordinateMapper, scrollToSwipeDirection } from "@/lib/appium/coords";

describe("CoordinateMapper", () => {
  const mapper = new CoordinateMapper({
    shotW: 1080,
    shotH: 2400,
    sentW: 706,
    sentH: 1568,
    winW: 1080,
    winH: 2337,
  });

  it("maps sent pixels back to device pixels", () => {
    expect(mapper.xScale).toBe(1);
    expect(mapper.yScale).toBeCloseTo(2400 / 2337);
    expect(mapper.toDevice(0, 0)).toEqual({ x: 0, y: 0 });
    expect(mapper.toDevice(353, 784)).toEqual({ x: 540, y: 1169 });
    expect(mapper.toDevice(706, 1568)).toEqual({ x: 1080, y: 2337 });
  });

  it("honours a screenshot that is larger than the window", () => {
    const scaled = new CoordinateMapper({
      shotW: 1080,
      shotH: 2400,
      sentW: 540,
      sentH: 1200,
      winW: 540,
      winH: 1170,
    });
    expect(scaled.xScale).toBe(2);
    expect(scaled.yScale).toBeCloseTo(2400 / 1170);
    expect(scaled.toDevice(270, 600)).toEqual({ x: 270, y: 585 });
  });

  it("round-trips device points through sent coordinates", () => {
    const point = mapper.toSent(540, 1200);
    expect(mapper.toDevice(point.x, point.y)).toEqual({ x: 540, y: 1200 });
  });

  it("maps normalized vision coordinates through the sent image to the device", () => {
    const fullScreen = new CoordinateMapper({
      shotW: 1080,
      shotH: 2400,
      sentW: 706,
      sentH: 1568,
      winW: 1080,
      winH: 2400,
    });

    expect(fullScreen.visionToSent(260, 372)).toEqual({ x: 184, y: 583 });
    expect(fullScreen.visionToDevice(260, 372)).toEqual({ x: 281, y: 892 });
  });

  it("uses independent axes when screenshot and device aspect ratios differ", () => {
    const differentExtents = new CoordinateMapper({
      shotW: 1080,
      shotH: 2400,
      sentW: 706,
      sentH: 1568,
      winW: 1080,
      winH: 2337,
    });

    expect(differentExtents.visionToDevice(500, 500)).toEqual({ x: 540, y: 1169 });
  });

  it("inverts scroll direction into a swipe direction", () => {
    expect(scrollToSwipeDirection("down")).toBe("up");
    expect(scrollToSwipeDirection("up")).toBe("down");
    expect(scrollToSwipeDirection("left")).toBe("right");
    expect(scrollToSwipeDirection("right")).toBe("left");
  });
});
