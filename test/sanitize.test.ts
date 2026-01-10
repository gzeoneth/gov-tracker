/**
 * Unit tests for security sanitization utilities
 *
 * Tests for:
 * - truncateDescription: DoS protection via large string truncation
 * - sanitizeForDisplay: Terminal escape injection protection
 * - safeJsonParse: Prototype pollution protection
 */

import { describe, it, expect } from "vitest";
import {
  truncateDescription,
  sanitizeForDisplay,
  safeJsonParse,
  MAX_DESCRIPTION_LENGTH,
} from "../src/utils/sanitize";

describe("Sanitization Utilities", () => {
  describe("truncateDescription", () => {
    it("should return short strings unchanged", () => {
      // #given - a short description string
      const description = "AIP-1: A simple proposal";

      // #when - truncating the description
      const result = truncateDescription(description);

      // #then - should return the original string unchanged
      expect(result).toBe(description);
    });

    it("should return strings at exactly the limit unchanged", () => {
      // #given - a description exactly at MAX_DESCRIPTION_LENGTH
      const description = "x".repeat(MAX_DESCRIPTION_LENGTH);

      // #when - truncating the description
      const result = truncateDescription(description);

      // #then - should return the original string unchanged
      expect(result).toBe(description);
      expect(result.length).toBe(MAX_DESCRIPTION_LENGTH);
    });

    it("should truncate strings exceeding the limit", () => {
      // #given - a description exceeding MAX_DESCRIPTION_LENGTH
      const description = "x".repeat(MAX_DESCRIPTION_LENGTH + 1000);

      // #when - truncating the description
      const result = truncateDescription(description);

      // #then - should truncate to MAX_DESCRIPTION_LENGTH + suffix
      expect(result.length).toBe(MAX_DESCRIPTION_LENGTH + "... [truncated]".length);
      expect(result.endsWith("... [truncated]")).toBe(true);
      expect(result.startsWith("x".repeat(100))).toBe(true);
    });

    it("should handle empty strings", () => {
      // #given - an empty description
      const description = "";

      // #when - truncating the description
      const result = truncateDescription(description);

      // #then - should return empty string unchanged
      expect(result).toBe("");
    });

    it("should preserve content up to the limit", () => {
      // #given - a description with meaningful content at the start
      const prefix = "Important content: ";
      const description = prefix + "x".repeat(MAX_DESCRIPTION_LENGTH + 1000);

      // #when - truncating the description
      const result = truncateDescription(description);

      // #then - should preserve the important prefix
      expect(result.startsWith(prefix)).toBe(true);
    });
  });

  describe("sanitizeForDisplay", () => {
    it("should return normal strings unchanged", () => {
      // #given - a normal string without control characters
      const str = "Hello, World! This is a normal string.";

      // #when - sanitizing for display
      const result = sanitizeForDisplay(str);

      // #then - should return the original string unchanged
      expect(result).toBe(str);
    });

    it("should preserve newlines and tabs", () => {
      // #given - a string with newlines and tabs
      const str = "Line 1\n\tIndented Line 2\r\nLine 3";

      // #when - sanitizing for display
      const result = sanitizeForDisplay(str);

      // #then - should preserve newlines, carriage returns, and tabs
      expect(result).toBe(str);
    });

    it("should remove ANSI color codes", () => {
      // #given - a string with ANSI color escape sequences
      const str = "\x1B[31mRed Text\x1B[0m and \x1B[1;32mGreen Bold\x1B[0m";

      // #when - sanitizing for display
      const result = sanitizeForDisplay(str);

      // #then - should remove ANSI codes but preserve text
      expect(result).toBe("Red Text and Green Bold");
    });

    it("should remove ANSI cursor movement codes", () => {
      // #given - a string with cursor movement escape sequences
      const str = "\x1B[2J\x1B[HHello\x1B[5A\x1B[10C";

      // #when - sanitizing for display
      const result = sanitizeForDisplay(str);

      // #then - should remove cursor codes but preserve text
      expect(result).toBe("Hello");
    });

    it("should remove OSC sequences with BEL terminator", () => {
      // #given - a string with OSC sequence terminated by BEL (0x07)
      const str = "\x1B]0;Evil Title\x07Normal Text";

      // #when - sanitizing for display
      const result = sanitizeForDisplay(str);

      // #then - should remove OSC sequence but preserve normal text
      expect(result).toBe("Normal Text");
    });

    it("should remove OSC sequences with ST terminator", () => {
      // #given - a string with OSC sequence terminated by ST (ESC \)
      const str = "\x1B]0;Evil Title\x1B\\Normal Text";

      // #when - sanitizing for display
      const result = sanitizeForDisplay(str);

      // #then - should remove OSC sequence but preserve normal text
      expect(result).toBe("Normal Text");
    });

    it("should remove control characters", () => {
      // #given - a string with various control characters
      const str = "Hello\x00\x01\x02World\x7F";

      // #when - sanitizing for display
      const result = sanitizeForDisplay(str);

      // #then - should remove control characters but preserve text
      expect(result).toBe("HelloWorld");
    });

    it("should handle empty strings", () => {
      // #given - an empty string
      const str = "";

      // #when - sanitizing for display
      const result = sanitizeForDisplay(str);

      // #then - should return empty string
      expect(result).toBe("");
    });

    it("should handle strings with only control characters", () => {
      // #given - a string with only control characters
      const str = "\x1B[31m\x1B[0m\x00\x01";

      // #when - sanitizing for display
      const result = sanitizeForDisplay(str);

      // #then - should return empty string
      expect(result).toBe("");
    });

    it("should handle complex malicious sequences", () => {
      // #given - a string designed to manipulate terminal output
      const malicious =
        "\x1B[2J\x1B[H\x1B]0;Pwned\x07\x1B[31m\x1B[1mFake Error\x1B[0m\nReal Content";

      // #when - sanitizing for display
      const result = sanitizeForDisplay(malicious);

      // #then - should remove all escape sequences and preserve only safe text
      expect(result).toBe("Fake Error\nReal Content");
      expect(result).not.toContain("\x1B");
      expect(result).not.toContain("\x07");
    });
  });

  describe("safeJsonParse", () => {
    it("should parse normal JSON correctly", () => {
      // #given - valid JSON with normal keys
      const json = '{"name": "test", "value": 123}';

      // #when - parsing with safeJsonParse
      const result = safeJsonParse<{ name: string; value: number }>(json);

      // #then - should parse correctly
      expect(result).toEqual({ name: "test", value: 123 });
    });

    it("should parse nested objects correctly", () => {
      // #given - valid JSON with nested structure
      const json = '{"outer": {"inner": {"deep": "value"}}}';

      // #when - parsing with safeJsonParse
      const result = safeJsonParse<{ outer: { inner: { deep: string } } }>(json);

      // #then - should parse nested structure correctly
      expect(result.outer.inner.deep).toBe("value");
    });

    it("should parse arrays correctly", () => {
      // #given - valid JSON with arrays
      const json = '{"items": [1, 2, 3], "nested": [{"id": 1}, {"id": 2}]}';

      // #when - parsing with safeJsonParse
      const result = safeJsonParse<{ items: number[]; nested: { id: number }[] }>(json);

      // #then - should parse arrays correctly
      expect(result.items).toEqual([1, 2, 3]);
      expect(result.nested).toEqual([{ id: 1 }, { id: 2 }]);
    });

    it("should strip __proto__ key to prevent prototype pollution", () => {
      // #given - JSON with __proto__ key attempting prototype pollution
      const json = '{"__proto__": {"polluted": true}, "safe": "value"}';

      // #when - parsing with safeJsonParse
      const result = safeJsonParse<{ safe: string }>(json);

      // #then - should strip __proto__ and not pollute Object.prototype
      expect(result.safe).toBe("value");
      // __proto__ should not be an own property on the result
      expect(Object.prototype.hasOwnProperty.call(result, "__proto__")).toBe(false);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((Object.prototype as any).polluted).toBeUndefined();
    });

    it("should strip constructor key", () => {
      // #given - JSON with constructor key
      const json = '{"constructor": {"polluted": true}, "safe": "value"}';

      // #when - parsing with safeJsonParse
      const result = safeJsonParse<{ safe: string }>(json);

      // #then - should strip constructor key (not be an own property)
      expect(result.safe).toBe("value");
      expect(Object.prototype.hasOwnProperty.call(result, "constructor")).toBe(false);
    });

    it("should strip prototype key", () => {
      // #given - JSON with prototype key
      const json = '{"prototype": {"polluted": true}, "safe": "value"}';

      // #when - parsing with safeJsonParse
      const result = safeJsonParse<{ safe: string }>(json);

      // #then - should strip prototype key
      expect(result.safe).toBe("value");
      expect((result as Record<string, unknown>).prototype).toBeUndefined();
    });

    it("should strip dangerous keys in nested objects", () => {
      // #given - JSON with dangerous keys in nested structure
      const json = '{"outer": {"__proto__": {"evil": true}, "constructor": {}, "valid": 1}}';

      // #when - parsing with safeJsonParse
      const result = safeJsonParse<{ outer: { valid: number } }>(json);

      // #then - should strip dangerous keys from nested objects (not be own properties)
      expect(result.outer.valid).toBe(1);
      expect(Object.prototype.hasOwnProperty.call(result.outer, "__proto__")).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(result.outer, "constructor")).toBe(false);
    });

    it("should throw on invalid JSON", () => {
      // #given - invalid JSON string
      const json = "not valid json";

      // #when - parsing with safeJsonParse
      // #then - should throw SyntaxError
      expect(() => safeJsonParse(json)).toThrow(SyntaxError);
    });

    it("should handle null values", () => {
      // #given - JSON with null values
      const json = '{"value": null}';

      // #when - parsing with safeJsonParse
      const result = safeJsonParse<{ value: null }>(json);

      // #then - should parse null correctly
      expect(result.value).toBeNull();
    });

    it("should not pollute Object.prototype even with crafted payload", () => {
      // #given - original Object.prototype state
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const originalPrototype = (Object.prototype as any).isAdmin;

      // #when - parsing malicious JSON
      const json = '{"__proto__": {"isAdmin": true}}';
      safeJsonParse(json);

      // #then - Object.prototype should remain unchanged
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((Object.prototype as any).isAdmin).toBe(originalPrototype);
      expect(Object.prototype.hasOwnProperty.call({}, "isAdmin")).toBe(false);
    });
  });

  describe("MAX_DESCRIPTION_LENGTH constant", () => {
    it("should be 100KB (100,000 characters)", () => {
      // #given - the MAX_DESCRIPTION_LENGTH constant
      // #when - checking its value
      // #then - should be 100,000 characters (~100KB for ASCII)
      expect(MAX_DESCRIPTION_LENGTH).toBe(100_000);
    });
  });
});
