/**
 * Salt Resolution Integration Tests
 *
 * Tests the deterministic salt computation during tracking phase
 */

import { describe, it, expect, beforeAll } from "vitest";
import { ethers } from "ethers";
import { ProposalStageTracker } from "../src/tracker";
import { saltFromDescription } from "../src/utils/salt-computation";
import { DEFAULT_RPC_URLS } from "../src";
import type { TrackedStage } from "../src/types";
import * as dotenv from "dotenv";

dotenv.config({ quiet: true });

// Test transactions
// AIP-1.2: A constitutional proposal that goes through full L1/L2 flow
const AIP_1_2_TX = "0x385043172e9314cdc34facf04efb540de5ff6ec99a41ec2ff373d79d0415736d";

// Security Council rotation: Creates multiple operations with SC-specific salt
const SC_ROTATION_TX = "0xa0d5366b53fc16ad524446a74f19cad23de4c96a939dfcd64555b3b12036c700";

describe.skipIf(process.env.NO_RPC === "1")("Salt Resolution Integration", () => {
  let tracker: ProposalStageTracker;
  let governorStages: TrackedStage[];
  let scStages: TrackedStage[];

  beforeAll(async () => {
    const ethRpc = process.env.ETH_RPC;
    if (!ethRpc) {
      throw new Error("RPC URLs required: Set ETH_RPC environment variables");
    }
    const arbRpc = process.env.ARB1_RPC || DEFAULT_RPC_URLS.ARB_ONE;

    const l2Provider = new ethers.providers.JsonRpcProvider(arbRpc);
    const l1Provider = new ethers.providers.JsonRpcProvider(ethRpc);

    tracker = new ProposalStageTracker({
      l1Provider,
      l2Provider,
    });

    // Track both transactions once before tests
    const govResults = await tracker.trackByTxHash(AIP_1_2_TX);
    governorStages = govResults[0].stages;

    const scResults = await tracker.trackByTxHash(SC_ROTATION_TX);
    scStages = scResults[0].stages;
  }, 300000); // 5 minute timeout for setup (SC rotation is slow)

  describe("Deterministic Salt Computation", () => {
    it("should compute and cache L1 timelock salt from L2→L1 message", async () => {
      const l2ToL1Stage = governorStages.find((s) => s.type === "L2_TO_L1_MESSAGE");
      const l1TimelockStage = governorStages.find((s) => s.type === "L1_TIMELOCK");

      expect(l2ToL1Stage).toBeDefined();
      expect(l1TimelockStage).toBeDefined();

      // L2→L1 message should store the raw event
      expect(l2ToL1Stage!.data.l2ToL1TxEvent).toBeDefined();
      expect(l2ToL1Stage!.data.l2ToL1TxEvent.data).toBeDefined();

      // L1 timelock should have salt and predecessor decoded from event
      expect(l1TimelockStage!.data.salt).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(l1TimelockStage!.data.predecessor).toMatch(/^0x[a-fA-F0-9]{64}$/);

      // Should successfully prepare with cached salt
      const prepResult = await tracker.prepareTransaction(l1TimelockStage!, {
        prepareCompleted: true,
      });
      expect(prepResult.success).toBe(true);

      console.log("✓ L1 timelock salt cached from L2→L1 message:", l1TimelockStage!.data.salt);
    });

    it("should compute and cache L2 governor salt from description", async () => {
      const proposalStage = governorStages.find((s) => s.type === "PROPOSAL_CREATED");
      const l2TimelockStage = governorStages.find((s) => s.type === "L2_TIMELOCK");

      expect(proposalStage).toBeDefined();
      expect(l2TimelockStage).toBeDefined();

      const description = proposalStage!.data.description as string;
      const expectedSalt = saltFromDescription(description);

      // L2 timelock should cache salt computed from description
      expect(l2TimelockStage!.data.salt).toBe(expectedSalt);

      // Should successfully prepare with cached salt
      const prepResult = await tracker.prepareTransaction(l2TimelockStage!, {
        prepareCompleted: true,
      });

      if (!prepResult.success) {
        console.error("Preparation failed:", prepResult.error);
        console.error("Stage data:", JSON.stringify(l2TimelockStage!.data, null, 2));
      }

      expect(prepResult.success).toBe(true);

      console.log(
        "✓ L2 governor salt cached from description:",
        l2TimelockStage!.data.salt?.slice(0, 10) + "..."
      );
    });

    it("should compute and cache Security Council salt from members and nonce", async () => {
      const l2TimelockStage = scStages.find((s) => s.type === "L2_TIMELOCK");
      expect(l2TimelockStage).toBeDefined();

      // Should detect as Security Council operation
      expect(l2TimelockStage!.data.isSecurityCouncilOperation).toBe(true);
      expect(l2TimelockStage!.data.securityCouncilMembers).toHaveLength(12);
      expect(l2TimelockStage!.data.securityCouncilNonce).toBeDefined();

      // Should cache SC-specific salt
      const cachedSalt = l2TimelockStage!.data.salt as string;
      expect(cachedSalt).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(cachedSalt).not.toBe(ethers.constants.HashZero);

      // Should successfully prepare with cached SC salt
      const prepResult = await tracker.prepareTransaction(l2TimelockStage!, {
        prepareCompleted: true,
      });
      expect(prepResult.success).toBe(true);

      console.log("✓ Security Council salt cached from on-chain:", cachedSalt.slice(0, 10) + "...");
    });

    it("should allow user to override cached salt via options", async () => {
      const l1TimelockStage = governorStages.find((s) => s.type === "L1_TIMELOCK");
      expect(l1TimelockStage).toBeDefined();

      const customSalt = "0x1234567890123456789012345678901234567890123456789012345678901234";

      // Should accept custom salt with skipSaltValidation
      const prepResult = await tracker.prepareTransaction(l1TimelockStage!, {
        salt: customSalt,
        skipSaltValidation: true,
        prepareCompleted: true,
      });

      expect(prepResult.success).toBe(true);
      console.log("✓ User salt override accepted");
    });
  });
});
