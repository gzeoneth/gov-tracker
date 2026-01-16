import { describe, it, expect } from "vitest";
import {
  formatDuration,
  wrapText,
  truncate,
  safeStringify,
  formatValue,
  formatDate,
  formatStageData,
  getTxHash,
  getProposalIdDisplay,
  formatDecodedCalldata,
  filterVisibleLines,
  getAllFoldableKeys,
  toggleFoldKey,
  type FormattedLine,
} from "../src/utils/formatters";
import type { TrackedStage, TrackingInput, DecodedCalldata } from "../src/types";

// ============================================================================
// wrapText
// ============================================================================

describe("wrapText", () => {
  it("should return single-element array when text fits within width", () => {
    // #given
    const text = "hello";
    const width = 10;

    // #when
    const result = wrapText(text, width);

    // #then
    expect(result).toEqual(["hello"]);
  });

  it("should return single-element array when text exactly equals width", () => {
    // #given
    const text = "hello";
    const width = 5;

    // #when
    const result = wrapText(text, width);

    // #then
    expect(result).toEqual(["hello"]);
  });

  it("should wrap text into multiple lines when exceeding width", () => {
    // #given
    const text = "abcdefghij";
    const width = 4;

    // #when
    const result = wrapText(text, width);

    // #then
    expect(result).toEqual(["abcd", "efgh", "ij"]);
  });

  it("should handle empty string", () => {
    // #given
    const text = "";
    const width = 10;

    // #when
    const result = wrapText(text, width);

    // #then
    expect(result).toEqual([""]);
  });

  it("should handle width of 1", () => {
    // #given
    const text = "abc";
    const width = 1;

    // #when
    const result = wrapText(text, width);

    // #then
    expect(result).toEqual(["a", "b", "c"]);
  });
});

// ============================================================================
// truncate
// ============================================================================

describe("truncate", () => {
  it("should return original string when shorter than maxLen", () => {
    // #given
    const str = "short";
    const maxLen = 10;

    // #when
    const result = truncate(str, maxLen);

    // #then
    expect(result).toBe("short");
  });

  it("should return original string when exactly equal to maxLen", () => {
    // #given
    const str = "exact";
    const maxLen = 5;

    // #when
    const result = truncate(str, maxLen);

    // #then
    expect(result).toBe("exact");
  });

  it("should truncate with ellipsis when exceeding maxLen", () => {
    // #given
    const str = "this is a long string";
    const maxLen = 10;

    // #when
    const result = truncate(str, maxLen);

    // #then
    expect(result).toBe("this is a...");
    expect(result.length).toBe(12);
  });

  it("should return ellipsis only when maxLen is 1 and string is non-empty", () => {
    // #given
    const str = "hello";
    const maxLen = 1;

    // #when
    const result = truncate(str, maxLen);

    // #then
    expect(result).toBe("...");
  });

  it("should return empty string when maxLen is 1 and string is empty", () => {
    // #given
    const str = "";
    const maxLen = 1;

    // #when
    const result = truncate(str, maxLen);

    // #then
    expect(result).toBe("");
  });

  it("should handle maxLen of 0", () => {
    // #given
    const str = "hello";
    const maxLen = 0;

    // #when
    const result = truncate(str, maxLen);

    // #then
    expect(result).toBe("...");
  });
});

// ============================================================================
// safeStringify
// ============================================================================

describe("safeStringify", () => {
  it("should stringify simple objects", () => {
    // #given
    const value = { a: 1, b: "test" };

    // #when
    const result = safeStringify(value);

    // #then
    expect(result).toBe('{"a":1,"b":"test"}');
  });

  it("should stringify arrays", () => {
    // #given
    const value = [1, 2, 3];

    // #when
    const result = safeStringify(value);

    // #then
    expect(result).toBe("[1,2,3]");
  });

  it("should stringify primitives", () => {
    // #given / #when / #then
    expect(safeStringify("hello")).toBe('"hello"');
    expect(safeStringify(42)).toBe("42");
    expect(safeStringify(true)).toBe("true");
    expect(safeStringify(null)).toBe("null");
  });

  it("should return fallback for circular references", () => {
    // #given
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;

    // #when
    const result = safeStringify(obj);

    // #then
    expect(result).toBe("[complex object]");
  });

  it("should return fallback for BigInt values", () => {
    // #given
    const value = { big: BigInt(123) };

    // #when
    const result = safeStringify(value);

    // #then
    expect(result).toBe("[complex object]");
  });
});

// ============================================================================
// formatValue
// ============================================================================

describe("formatValue", () => {
  it("should return N/A for null", () => {
    // #given
    const value = null;

    // #when
    const result = formatValue(value);

    // #then
    expect(result).toBe("N/A");
  });

  it("should return N/A for undefined", () => {
    // #given
    const value = undefined;

    // #when
    const result = formatValue(value);

    // #then
    expect(result).toBe("N/A");
  });

  it("should return string as-is", () => {
    // #given
    const value = "hello world";

    // #when
    const result = formatValue(value);

    // #then
    expect(result).toBe("hello world");
  });

  it("should convert number to string", () => {
    // #given
    const value = 12345;

    // #when
    const result = formatValue(value);

    // #then
    expect(result).toBe("12345");
  });

  it("should return Yes for true", () => {
    // #given
    const value = true;

    // #when
    const result = formatValue(value);

    // #then
    expect(result).toBe("Yes");
  });

  it("should return No for false", () => {
    // #given
    const value = false;

    // #when
    const result = formatValue(value);

    // #then
    expect(result).toBe("No");
  });

  it("should return [] for empty array", () => {
    // #given
    const value: unknown[] = [];

    // #when
    const result = formatValue(value);

    // #then
    expect(result).toBe("[]");
  });

  it("should stringify small arrays (3 or fewer elements)", () => {
    // #given
    const value = [1, 2, 3];

    // #when
    const result = formatValue(value);

    // #then
    expect(result).toBe("[1,2,3]");
  });

  it("should show count for large arrays (more than 3 elements)", () => {
    // #given
    const value = [1, 2, 3, 4, 5];

    // #when
    const result = formatValue(value);

    // #then
    expect(result).toBe("[5 items]");
  });

  it("should stringify objects", () => {
    // #given
    const value = { key: "value" };

    // #when
    const result = formatValue(value);

    // #then
    expect(result).toBe('{"key":"value"}');
  });

  it("should convert other types using String()", () => {
    // #given
    const value = Symbol("test");

    // #when
    const result = formatValue(value);

    // #then
    expect(result).toBe("Symbol(test)");
  });
});

// ============================================================================
// formatDate
// ============================================================================

describe("formatDate", () => {
  it("should return Unknown for null timestamp", () => {
    // #given
    const timestamp = null;

    // #when
    const result = formatDate(timestamp);

    // #then
    expect(result).toBe("Unknown");
  });

  it("should format valid timestamp to locale string", () => {
    // #given - Unix timestamp in milliseconds
    const timestamp = 1704067200000;

    // #when
    const result = formatDate(timestamp);

    // #then - result format varies by locale, just verify it produces something
    expect(result).not.toBe("Unknown");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("should handle timestamp of 0", () => {
    // #given
    const timestamp = 0;

    // #when
    const result = formatDate(timestamp);

    // #then - epoch time should produce a valid date string
    expect(result).not.toBe("Unknown");
  });
});

// ============================================================================
// formatStageData
// ============================================================================

describe("formatStageData", () => {
  it("should return empty array when stage has no data", () => {
    // #given
    const stage = {
      type: "PROPOSAL_CREATED",
      status: "COMPLETED",
      chain: "arb1",
      chainId: 42161,
      transactions: [],
      data: undefined,
    } as unknown as TrackedStage;

    // #when
    const result = formatStageData(stage);

    // #then
    expect(result).toEqual([]);
  });

  it("should format priority fields first", () => {
    // #given
    const stage = {
      type: "PROPOSAL_CREATED",
      status: "COMPLETED",
      chain: "arb1",
      chainId: 42161,
      transactions: [],
      data: {
        proposer: "0x1234567890123456789012345678901234567890",
        description: "Test proposal",
        customField: "custom value",
      },
    } as unknown as TrackedStage;

    // #when
    const result = formatStageData(stage);

    // #then - priority fields should come first
    expect(result[0].label).toBe("proposer");
    expect(result[1].label).toBe("description");
    expect(result.find((item) => item.label === "customField")).toBeDefined();
  });

  it("should truncate long description to 100 chars", () => {
    // #given
    const longDescription = "a".repeat(150);
    const stage = {
      type: "PROPOSAL_CREATED",
      status: "COMPLETED",
      chain: "arb1",
      chainId: 42161,
      transactions: [],
      data: {
        description: longDescription,
      },
    } as unknown as TrackedStage;

    // #when
    const result = formatStageData(stage);

    // #then
    const descItem = result.find((item) => item.label === "description");
    expect(descItem).toBeDefined();
    expect(descItem!.value.length).toBe(103);
    expect(descItem!.value.endsWith("...")).toBe(true);
  });

  it("should skip fields in STAGE_SKIP_FIELDS", () => {
    // #given
    const stage = {
      type: "PROPOSAL_QUEUED",
      status: "COMPLETED",
      chain: "arb1",
      chainId: 42161,
      transactions: [],
      data: {
        proposalState: "Queued",
        targets: ["0x123"],
        values: ["0"],
        calldatas: ["0x"],
        signatures: ["test()"],
        customField: "shown",
      },
    } as unknown as TrackedStage;

    // #when
    const result = formatStageData(stage);

    // #then - skip fields should not appear
    expect(result.find((item) => item.label === "targets")).toBeUndefined();
    expect(result.find((item) => item.label === "values")).toBeUndefined();
    expect(result.find((item) => item.label === "calldatas")).toBeUndefined();
    expect(result.find((item) => item.label === "signatures")).toBeUndefined();
    expect(result.find((item) => item.label === "customField")).toBeDefined();
  });

  it("should truncate long non-priority field values to 80 chars", () => {
    // #given
    const stage = {
      type: "PROPOSAL_CREATED",
      status: "COMPLETED",
      chain: "arb1",
      chainId: 42161,
      transactions: [],
      data: {
        customField: "b".repeat(100),
      },
    } as unknown as TrackedStage;

    // #when
    const result = formatStageData(stage);

    // #then
    const customItem = result.find((item) => item.label === "customField");
    expect(customItem).toBeDefined();
    expect(customItem!.value.length).toBe(83);
    expect(customItem!.value.endsWith("...")).toBe(true);
  });

  it("should skip null and undefined values in non-priority fields", () => {
    // #given
    const stage = {
      type: "PROPOSAL_CREATED",
      status: "COMPLETED",
      chain: "arb1",
      chainId: 42161,
      transactions: [],
      data: {
        customNull: null,
        customUndefined: undefined,
        customValid: "valid",
      },
    } as unknown as TrackedStage;

    // #when
    const result = formatStageData(stage);

    // #then
    expect(result.find((item) => item.label === "customNull")).toBeUndefined();
    expect(result.find((item) => item.label === "customUndefined")).toBeUndefined();
    expect(result.find((item) => item.label === "customValid")).toBeDefined();
  });
});

// ============================================================================
// getTxHash
// ============================================================================

describe("getTxHash", () => {
  it("should return creationTxHash for governor input", () => {
    // #given
    const input: TrackingInput = {
      type: "governor",
      governorAddress: "0x123",
      proposalId: "1",
      creationTxHash: "0xabcdef",
    };

    // #when
    const result = getTxHash(input);

    // #then
    expect(result).toBe("0xabcdef");
  });

  it("should return scheduledTxHash for timelock input", () => {
    // #given
    const input: TrackingInput = {
      type: "timelock",
      timelockAddress: "0x456",
      operationId: "0xopid",
      scheduledTxHash: "0xfedcba",
    };

    // #when
    const result = getTxHash(input);

    // #then
    expect(result).toBe("0xfedcba");
  });

  it("should return empty string for discovery input", () => {
    // #given
    const input: TrackingInput = {
      type: "discovery",
      id: "watermarks",
    };

    // #when
    const result = getTxHash(input);

    // #then
    expect(result).toBe("");
  });

  it("should return empty string for election input", () => {
    // #given
    const input: TrackingInput = {
      type: "election",
      electionIndex: 5,
    };

    // #when
    const result = getTxHash(input);

    // #then
    expect(result).toBe("");
  });
});

// ============================================================================
// getProposalIdDisplay
// ============================================================================

describe("getProposalIdDisplay", () => {
  it("should return proposalId for governor input", () => {
    // #given
    const input: TrackingInput = {
      type: "governor",
      governorAddress: "0x123",
      proposalId: "12345678901234567890",
      creationTxHash: "0xabc",
    };

    // #when
    const result = getProposalIdDisplay(input);

    // #then
    expect(result).toBe("12345678901234567890");
  });

  it("should return operationId for timelock input", () => {
    // #given
    const input: TrackingInput = {
      type: "timelock",
      timelockAddress: "0x456",
      operationId: "0x9876543210",
      scheduledTxHash: "0xdef",
    };

    // #when
    const result = getProposalIdDisplay(input);

    // #then
    expect(result).toBe("0x9876543210");
  });

  it("should return id for discovery input", () => {
    // #given
    const input: TrackingInput = {
      type: "discovery",
      id: "watermarks",
    };

    // #when
    const result = getProposalIdDisplay(input);

    // #then
    expect(result).toBe("watermarks");
  });

  it("should return election-{index} for election input", () => {
    // #given
    const input: TrackingInput = {
      type: "election",
      electionIndex: 3,
    };

    // #when
    const result = getProposalIdDisplay(input);

    // #then
    expect(result).toBe("election-3");
  });
});

// ============================================================================
// formatDecodedCalldata
// ============================================================================

describe("formatDecodedCalldata", () => {
  it("should format retryable ticket header", () => {
    // #given
    const decoded: DecodedCalldata = {
      isRetryable: true,
      targetChain: "arb1",
      selector: "",
      signature: null,
      parameters: [],
      raw: "0x",
      decodingSource: "local",
    };

    // #when
    const result = formatDecodedCalldata(decoded);

    // #then
    expect(result[0].text).toBe("Retryable Ticket -> arb1");
    expect(result[0].foldable).toBe(false);
  });

  it("should format regular calldata with signature", () => {
    // #given
    const decoded: DecodedCalldata = {
      selector: "0x12345678",
      signature: "transfer(address,uint256)",
      parameters: [],
      raw: "0x",
      decodingSource: "local",
    };

    // #when
    const result = formatDecodedCalldata(decoded);

    // #then
    expect(result[0].text).toBe("transfer(address,uint256)");
  });

  it("should format unknown function with selector", () => {
    // #given
    const decoded: DecodedCalldata = {
      selector: "0xdeadbeef",
      signature: null,
      parameters: [],
      raw: "0x",
      decodingSource: "failed",
    };

    // #when
    const result = formatDecodedCalldata(decoded);

    // #then
    expect(result[0].text).toBe("Unknown function (0xdeadbeef)");
  });

  it("should format parameters with name, type, and value", () => {
    // #given
    const decoded: DecodedCalldata = {
      selector: "0x12345678",
      signature: "transfer(address,uint256)",
      parameters: [
        {
          name: "to",
          type: "address",
          displayValue: "0x1234",
          rawValue: "0x1234",
          isNested: false,
        },
        {
          name: "amount",
          type: "uint256",
          displayValue: "1000",
          rawValue: "1000",
          isNested: false,
        },
      ],
      raw: "0x",
      decodingSource: "local",
    };

    // #when
    const result = formatDecodedCalldata(decoded);

    // #then
    expect(result[1].text).toBe("to (address): 0x1234");
    expect(result[1].indent).toBe(1);
    expect(result[2].text).toBe("amount (uint256): 1000");
  });

  it("should include address label when present", () => {
    // #given
    const decoded: DecodedCalldata = {
      selector: "0x12345678",
      signature: "setTarget(address)",
      parameters: [
        {
          name: "target",
          type: "address",
          displayValue: "0xABCD",
          rawValue: "0xABCD",
          isNested: false,
          addressLabel: "L1 Timelock",
        },
      ],
      raw: "0x",
      decodingSource: "local",
    };

    // #when
    const result = formatDecodedCalldata(decoded);

    // #then
    expect(result[1].text).toBe("target (address): 0xABCD [L1 Timelock]");
  });

  it("should mark long values as foldable and wrap them", () => {
    // #given
    const longValue = "a".repeat(150);
    const decoded: DecodedCalldata = {
      selector: "0x12345678",
      signature: "setData(bytes)",
      parameters: [
        {
          name: "data",
          type: "bytes",
          displayValue: longValue,
          rawValue: longValue,
          isNested: false,
        },
      ],
      raw: "0x",
      decodingSource: "local",
    };

    // #when
    const result = formatDecodedCalldata(decoded);

    // #then - first line should be foldable
    expect(result[1].foldable).toBe(true);
    expect(result[1].foldKey).toBe("root-p0-data");
    expect(result[1].foldedLineCount).toBe(1);

    // continuation lines should be marked as folded content
    expect(result[2].isFoldedContent).toBe(true);
    expect(result[2].indent).toBe(2);
  });

  it("should format nested calldata", () => {
    // #given
    const decoded: DecodedCalldata = {
      selector: "0x12345678",
      signature: "execute(bytes)",
      parameters: [
        {
          name: "data",
          type: "bytes",
          displayValue: "0x...",
          rawValue: "0x...",
          isNested: true,
          nested: {
            selector: "0xabcdef00",
            signature: "innerFunction()",
            parameters: [],
            raw: "0x",
            decodingSource: "local",
          },
        },
      ],
      raw: "0x",
      decodingSource: "local",
    };

    // #when
    const result = formatDecodedCalldata(decoded);

    // #then
    expect(result.some((line) => line.text === "|- [NESTED]")).toBe(true);
    expect(result.some((line) => line.text === "innerFunction()")).toBe(true);
  });

  it("should format nestedArray elements", () => {
    // #given
    const decoded: DecodedCalldata = {
      selector: "0x12345678",
      signature: "batchExecute(bytes[])",
      parameters: [
        {
          name: "calls",
          type: "bytes[]",
          displayValue: "[...]",
          rawValue: [],
          isNested: true,
          nestedArray: [
            {
              selector: "0xaaaa",
              signature: "call1()",
              parameters: [],
              raw: "0x",
              decodingSource: "local",
            },
            {
              selector: "0xbbbb",
              signature: "call2()",
              parameters: [],
              raw: "0x",
              decodingSource: "local",
            },
          ],
        },
      ],
      raw: "0x",
      decodingSource: "local",
    };

    // #when
    const result = formatDecodedCalldata(decoded);

    // #then
    expect(result.some((line) => line.text === "[0]:")).toBe(true);
    expect(result.some((line) => line.text === "[1]:")).toBe(true);
    expect(result.some((line) => line.text === "call1()")).toBe(true);
    expect(result.some((line) => line.text === "call2()")).toBe(true);
  });

  it("should apply custom indent and keyPrefix", () => {
    // #given
    const decoded: DecodedCalldata = {
      selector: "0x12345678",
      signature: "test()",
      parameters: [],
      raw: "0x",
      decodingSource: "local",
    };

    // #when
    const result = formatDecodedCalldata(decoded, 3, "custom");

    // #then
    expect(result[0].indent).toBe(3);
  });

  it("should handle null parameters", () => {
    // #given
    const decoded: DecodedCalldata = {
      selector: "0x12345678",
      signature: "test()",
      parameters: null,
      raw: "0x",
      decodingSource: "failed",
    };

    // #when
    const result = formatDecodedCalldata(decoded);

    // #then - should only have header line, no parameter lines
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("test()");
  });

  it("should skip empty nestedArray", () => {
    // #given
    const decoded: DecodedCalldata = {
      selector: "0x12345678",
      signature: "batchExecute(bytes[])",
      parameters: [
        {
          name: "calls",
          type: "bytes[]",
          displayValue: "[]",
          rawValue: [],
          isNested: false,
          nestedArray: [],
        },
      ],
      raw: "0x",
      decodingSource: "local",
    };

    // #when
    const result = formatDecodedCalldata(decoded);

    // #then - should have header and parameter line, but no array indices
    expect(result).toHaveLength(2);
    expect(result.some((line) => line.text.startsWith("["))).toBe(false);
  });
});

// ============================================================================
// filterVisibleLines
// ============================================================================

describe("filterVisibleLines", () => {
  it("should show all non-folded content lines", () => {
    // #given
    const lines: FormattedLine[] = [
      { text: "header", indent: 0, foldable: false },
      { text: "param", indent: 1, foldable: false },
    ];
    const expandedKeys = new Set<string>();

    // #when
    const result = filterVisibleLines(lines, expandedKeys);

    // #then
    expect(result).toHaveLength(2);
  });

  it("should hide folded content when key is not expanded", () => {
    // #given
    const lines: FormattedLine[] = [
      { text: "header", indent: 0, foldable: true, foldKey: "key1" },
      {
        text: "hidden content",
        indent: 1,
        foldable: false,
        isFoldedContent: true,
        foldKey: "key1",
      },
    ];
    const expandedKeys = new Set<string>();

    // #when
    const result = filterVisibleLines(lines, expandedKeys);

    // #then
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("header");
  });

  it("should show folded content when key is expanded", () => {
    // #given
    const lines: FormattedLine[] = [
      { text: "header", indent: 0, foldable: true, foldKey: "key1" },
      {
        text: "visible content",
        indent: 1,
        foldable: false,
        isFoldedContent: true,
        foldKey: "key1",
      },
    ];
    const expandedKeys = new Set<string>(["key1"]);

    // #when
    const result = filterVisibleLines(lines, expandedKeys);

    // #then
    expect(result).toHaveLength(2);
  });

  it("should handle lines without foldKey but with isFoldedContent", () => {
    // #given
    const lines: FormattedLine[] = [
      { text: "orphan folded", indent: 0, foldable: false, isFoldedContent: true },
    ];
    const expandedKeys = new Set<string>();

    // #when
    const result = filterVisibleLines(lines, expandedKeys);

    // #then - should be filtered out (foldKey is undefined, not in expandedKeys)
    expect(result).toHaveLength(0);
  });
});

// ============================================================================
// getAllFoldableKeys
// ============================================================================

describe("getAllFoldableKeys", () => {
  it("should return empty array when no foldable lines", () => {
    // #given
    const lines: FormattedLine[] = [
      { text: "line1", indent: 0, foldable: false },
      { text: "line2", indent: 1, foldable: false },
    ];

    // #when
    const result = getAllFoldableKeys(lines);

    // #then
    expect(result).toEqual([]);
  });

  it("should return foldKeys for foldable lines", () => {
    // #given
    const lines: FormattedLine[] = [
      { text: "line1", indent: 0, foldable: true, foldKey: "key1" },
      { text: "line2", indent: 1, foldable: false },
      { text: "line3", indent: 0, foldable: true, foldKey: "key2" },
    ];

    // #when
    const result = getAllFoldableKeys(lines);

    // #then
    expect(result).toEqual(["key1", "key2"]);
  });

  it("should skip foldable lines without foldKey", () => {
    // #given
    const lines: FormattedLine[] = [
      { text: "line1", indent: 0, foldable: true },
      { text: "line2", indent: 0, foldable: true, foldKey: "key1" },
    ];

    // #when
    const result = getAllFoldableKeys(lines);

    // #then
    expect(result).toEqual(["key1"]);
  });
});

// ============================================================================
// toggleFoldKey
// ============================================================================

describe("toggleFoldKey", () => {
  it("should add key when not present", () => {
    // #given
    const expandedKeys = new Set<string>(["existing"]);
    const foldKey = "newkey";

    // #when
    const result = toggleFoldKey(expandedKeys, foldKey);

    // #then
    expect(result.has("newkey")).toBe(true);
    expect(result.has("existing")).toBe(true);
    expect(result.size).toBe(2);
  });

  it("should remove key when present", () => {
    // #given
    const expandedKeys = new Set<string>(["key1", "key2"]);
    const foldKey = "key1";

    // #when
    const result = toggleFoldKey(expandedKeys, foldKey);

    // #then
    expect(result.has("key1")).toBe(false);
    expect(result.has("key2")).toBe(true);
    expect(result.size).toBe(1);
  });

  it("should not mutate original set", () => {
    // #given
    const expandedKeys = new Set<string>(["key1"]);
    const foldKey = "key2";

    // #when
    const result = toggleFoldKey(expandedKeys, foldKey);

    // #then
    expect(expandedKeys.has("key2")).toBe(false);
    expect(result.has("key2")).toBe(true);
    expect(expandedKeys).not.toBe(result);
  });

  it("should handle empty set", () => {
    // #given
    const expandedKeys = new Set<string>();
    const foldKey = "key1";

    // #when
    const result = toggleFoldKey(expandedKeys, foldKey);

    // #then
    expect(result.has("key1")).toBe(true);
    expect(result.size).toBe(1);
  });
});

// ============================================================================
// formatDuration (existing tests below)
// ============================================================================

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

  it("should return 0s for fractional seconds less than 1", () => {
    // #given - 0.5 seconds (rounds to 0 total seconds)
    const seconds = 0.5;

    // #when
    const result = formatDuration(seconds);

    // #then - parts array is empty after floor, fallback to "0s"
    expect(result).toBe("0s");
  });
});
