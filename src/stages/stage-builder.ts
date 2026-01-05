/**
 * Fluent API for constructing TrackedStage objects
 */

import {
  ChainType,
  StageStatus,
  StageType,
  StageTransaction,
  StageTiming,
  TargetChainType,
  TrackedStage,
  TrackedStageData,
} from "../types";

export class StageBuilder {
  private _stage: TrackedStage;

  constructor(type: StageType, chain: ChainType, status: StageStatus = "NOT_STARTED") {
    this._stage = {
      type,
      status,
      chain,
      transactions: [],
      data: {},
      executable: false,
    };
  }

  /**
   * Set stage status
   */
  status(status: StageStatus): this {
    this._stage.status = status;
    this._stage.executable = status === "READY";
    return this;
  }

  /**
   * Add data to the stage (merges with existing data)
   */
  data(data: TrackedStageData): this {
    this._stage.data = { ...this._stage.data, ...data };
    return this;
  }

  /**
   * Set timing information (merges with existing timing)
   */
  timing(timing: Partial<StageTiming>): this {
    this._stage.timing = { ...this._stage.timing, ...timing };
    return this;
  }

  /**
   * Add a transaction to the stage
   */
  tx(
    hash: string,
    blockNumber: number,
    chain: ChainType,
    options: {
      timestamp?: number;
      logIndex?: number;
      targetChain?: TargetChainType;
      description?: string;
    } = {}
  ): this {
    const tx: StageTransaction = { hash, blockNumber, chain };
    if (options.timestamp !== undefined) tx.timestamp = options.timestamp;
    if (options.logIndex !== undefined) tx.logIndex = options.logIndex;
    if (options.targetChain !== undefined) tx.targetChain = options.targetChain;
    if (options.description !== undefined) tx.description = options.description;
    this._stage.transactions = [...this._stage.transactions, tx];
    return this;
  }

  /**
   * Mark stage as skipped with reason
   */
  skip(reason: string): this {
    this._stage.status = "SKIPPED";
    this._stage.executable = false;
    this._stage.data = { ...this._stage.data, skipReason: reason };
    return this;
  }

  /**
   * Set transactions directly (for merging from multiple sources)
   */
  transactions(txs: StageTransaction[]): this {
    this._stage.transactions = txs;
    return this;
  }

  /**
   * Set executable flag directly
   */
  executable(value: boolean): this {
    this._stage.executable = value;
    return this;
  }

  /**
   * Build and return the final stage object
   */
  build(): TrackedStage {
    return { ...this._stage };
  }
}
