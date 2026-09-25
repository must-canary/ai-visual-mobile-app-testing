import type { Direction } from "@/lib/dsl/types";

export type MapperInput = {
  shotW: number;
  shotH: number;
  sentW: number;
  sentH: number;
  winW: number;
  winH: number;
};

export type Point = { x: number; y: number };

export const VISION_COORDINATE_MAX = 1000;

export class CoordinateMapper {
  readonly shotW: number;
  readonly shotH: number;
  readonly sentW: number;
  readonly sentH: number;
  readonly winW: number;
  readonly winH: number;

  constructor(input: MapperInput) {
    this.shotW = input.shotW;
    this.shotH = input.shotH;
    this.sentW = input.sentW;
    this.sentH = input.sentH;
    this.winW = input.winW;
    this.winH = input.winH;
  }

  get xScale(): number {
    return this.shotW / this.winW;
  }

  get yScale(): number {
    return this.shotH / this.winH;
  }

  toDevice(x: number, y: number): Point {
    const shotX = (x * this.shotW) / this.sentW;
    const shotY = (y * this.shotH) / this.sentH;
    return {
      x: Math.round(shotX / this.xScale),
      y: Math.round(shotY / this.yScale),
    };
  }

  toSent(deviceX: number, deviceY: number): Point {
    return {
      x: Math.round((deviceX * this.xScale * this.sentW) / this.shotW),
      y: Math.round((deviceY * this.yScale * this.sentH) / this.shotH),
    };
  }

  visionToSent(x: number, y: number): Point {
    return {
      x: Math.round((x * this.sentW) / VISION_COORDINATE_MAX),
      y: Math.round((y * this.sentH) / VISION_COORDINATE_MAX),
    };
  }

  visionToDevice(x: number, y: number): Point {
    const sent = this.visionToSent(x, y);
    return this.toDevice(sent.x, sent.y);
  }
}

export function scrollToSwipeDirection(direction: Direction): Direction {
  switch (direction) {
    case "down":
      return "up";
    case "up":
      return "down";
    case "left":
      return "right";
    case "right":
      return "left";
  }
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
