import { describe, it, expect } from "vitest";
import { formatDuration } from "../src/utils/formatters";

describe("formatDuration", () => {
  it("should return 'now' for zero or negative seconds", () => {
    // #given
    const seconds = 0;

    // #when
    const result = formatDuration(seconds);

    // #then
    expect(result).toBe("now");
  });

  it("should return 'now' for negative seconds", () => {
    // #given
    const seconds = -100;

    // #when
    const result = formatDuration(seconds);

    // #then
    expect(result).toBe("now");
  });

  it("should format days and hours for multi-day durations", () => {
    // #given - 2 days, 3 hours, 45 minutes, 30 seconds
    const seconds = 2 * 86400 + 3 * 3600 + 45 * 60 + 30;

    // #when
    const result = formatDuration(seconds);

    // #then
    expect(result).toBe("2d 3h");
  });

  it("should show minutes and seconds for short durations", () => {
    // #given - 5 minutes 30 seconds
    const seconds = 5 * 60 + 30;

    // #when
    const result = formatDuration(seconds);

    // #then
    expect(result).toBe("5m 30s");
  });

  it("should handle hours only", () => {
    // #given - 2 hours exactly
    const seconds = 2 * 3600;

    // #when
    const result = formatDuration(seconds);

    // #then
    expect(result).toBe("2h");
  });

  it("should handle days and hours without minutes", () => {
    // #given - 1 day, 1 hour
    const seconds = 1 * 86400 + 1 * 3600;

    // #when
    const result = formatDuration(seconds);

    // #then
    expect(result).toBe("1d 1h");
  });

  it("should handle hours and minutes", () => {
    // #given - 1 hour, 30 minutes
    const seconds = 1 * 3600 + 30 * 60;

    // #when
    const result = formatDuration(seconds);

    // #then
    expect(result).toBe("1h 30m");
  });

  it("should handle seconds only", () => {
    // #given - 45 seconds
    const seconds = 45;

    // #when
    const result = formatDuration(seconds);

    // #then
    expect(result).toBe("45s");
  });
});
