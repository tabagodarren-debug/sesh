import { describe, expect, it } from "vitest";
import { restoredWindowSize } from "../src/services/window";

const compact = { width: 680, height: 140, minWidth: 420, minHeight: 88 };

describe("window bounds restoration", () => {
  it("keeps a user-selected large compact size instead of applying a fixed cap", () => {
    expect(restoredWindowSize({ width: 2560, height: 1440 }, compact)).toEqual({
      width: 2560,
      height: 1440,
    });
  });

  it("restores near-minimum measurements at the compact minimum", () => {
    expect(restoredWindowSize({ width: 419.5, height: 87.5 }, compact)).toEqual({
      width: 420,
      height: 88,
    });
  });

  it("rejects corrupt stored dimensions", () => {
    expect(restoredWindowSize({ width: Number.NaN, height: 88 }, compact)).toBeNull();
    expect(restoredWindowSize({ width: 420, height: -1 }, compact)).toBeNull();
  });
});
