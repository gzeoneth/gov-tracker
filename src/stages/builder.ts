/**
 * Fluent API for constructing TrackedStage objects
 *
 * Generic over StageType to ensure type-safe data assignment.
 */

import {
  Chain,
  ChainId,
  chainToChainId,
  StageStatus,
  StageType,
  StageTransaction,
  StageTiming,
  StageDataMap,
  TypedTrackedStage,
} from "../types";

/**
 * Internal builder state - uses partial data during construction
 */
interface BuilderState<T extends StageType> {
  type: T;
  status: StageStatus;
  chain: Chain;
  chainId: ChainId;
  transactions: StageTransaction[];
  data: Partial<StageDataMap[T]>;
  timing?: StageTiming;
  executable: boolean;
  error?: string;
}

export class StageBuilder<T extends StageType> {
  private _stage: BuilderState<T>;

  constructor(type: T, chain: Chain, status: StageStatus = "NOT_STARTED") {
    const chainId = chainToChainId(chain) ?? 0;
    this._stage = {
      type,
      status,
      chain,
      chainId,
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
  data(data: Partial<StageDataMap[T]>): this {
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
    chain: Chain,
    chainId: ChainId,
    options: {
      timestamp?: number;
      logIndex?: number;
      targetChain?: Chain;
      targetChainId?: ChainId;
      description?: string;
    } = {}
  ): this {
    const tx: StageTransaction = { hash, blockNumber, chain, chainId };
    if (options.timestamp !== undefined) tx.timestamp = options.timestamp;
    if (options.logIndex !== undefined) tx.logIndex = options.logIndex;
    if (options.targetChain !== undefined) tx.targetChain = options.targetChain;
    if (options.targetChainId !== undefined) tx.targetChainId = options.targetChainId;
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
    this._stage.data = { ...this._stage.data, skipReason: reason } as Partial<StageDataMap[T]>;
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
   * Build and return the final stage object.
   * The data field is cast to the full type - callers should ensure
   * required fields are populated before calling build().
   */
  build(): TypedTrackedStage<T> {
    // TypeScript cannot prove the generic satisfies the discriminated union,
    // but we control construction and know it's valid
    return {
      ...this._stage,
      data: this._stage.data as StageDataMap[T],
    } as TypedTrackedStage<T>;
  }
}
