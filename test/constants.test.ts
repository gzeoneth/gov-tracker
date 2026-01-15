import { describe, it, expect } from "vitest";
import { proposalStateToString } from "../src/constants";

describe("proposalStateToString", () => {
  it("should convert state number to string", () => {
    // #given
    const state = 1;

    // #when
    const result = proposalStateToString(state);

    // #then
    expect(result).toBe("Active");
  });

  it("should handle all valid states", () => {
    // #when & #then
    expect(proposalStateToString(0)).toBe("Pending");
    expect(proposalStateToString(1)).toBe("Active");
    expect(proposalStateToString(2)).toBe("Canceled");
    expect(proposalStateToString(3)).toBe("Defeated");
    expect(proposalStateToString(4)).toBe("Succeeded");
    expect(proposalStateToString(5)).toBe("Queued");
    expect(proposalStateToString(6)).toBe("Expired");
    expect(proposalStateToString(7)).toBe("Executed");
  });

  it("should throw for invalid state number", () => {
    // #given
    const invalidState = 99;

    // #when & #then
    expect(() => proposalStateToString(invalidState)).toThrow("Unknown proposal state");
  });

  it("should throw for negative state number", () => {
    // #given
    const negativeState = -1;

    // #when & #then
    expect(() => proposalStateToString(negativeState)).toThrow("Unknown proposal state");
  });
});
