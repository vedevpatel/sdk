import { SeededRng } from "./seeded-rng";

/** A committed side effect (e.g. a booked refund) inside the provider. */
export interface Effect {
  effectId: string;
  operationId: string;
  idempotencyKey?: string;
  amount: number;
}

export interface CommitRequest {
  operationId: string;
  amount: number;
  /**
   * Stable idempotency key. When present, the provider treats commits as
   * idempotent: the same key always resolves to the same canonical effect.
   * When absent (the naive path), every commit books a brand new effect.
   */
  idempotencyKey?: string;
}

export class ProviderUnavailableError extends Error {
  constructor(message = "provider unavailable") {
    super(message);
    this.name = "ProviderUnavailableError";
  }
}

/**
 * Deterministic simulator of an external payment/refund provider.
 *
 * The provider never touches real money or network. It models three phases of
 * a side-effecting write — `dispatch` (send request), `commit` (book effect),
 * `ack` (acknowledge) — plus a `reconcile` query used to recover from an
 * ambiguous outcome. All identifiers are derived from a seeded RNG so a given
 * `seed + scenario` yields an identical trace.
 */
export class SimulatedProvider {
  private readonly rng: SeededRng;
  private readonly effects: Effect[] = [];
  private readonly byKey = new Map<string, string>();
  private dispatchCount = 0;
  private ackCount = 0;
  private reconcileCount = 0;

  /**
   * Number of dispatch attempts to reject with `ProviderUnavailableError`
   * before the provider starts accepting requests. Used to exercise the
   * bounded-retry path; unrelated to fault injection.
   */
  private unavailableAttempts: number;

  constructor(seed: number, options: { unavailableAttempts?: number } = {}) {
    this.rng = new SeededRng(seed);
    this.unavailableAttempts = options.unavailableAttempts ?? 0;
  }

  /**
   * Begins a dispatch attempt. Returns the attempt number. Throws
   * `ProviderUnavailableError` while the provider is configured as unavailable.
   */
  dispatch(): number {
    this.dispatchCount += 1;
    if (this.dispatchCount <= this.unavailableAttempts) {
      throw new ProviderUnavailableError();
    }
    return this.dispatchCount;
  }

  /**
   * Books a side effect. Idempotent when an idempotency key is supplied: the
   * same key resolves to the same canonical effect and no duplicate is booked.
   */
  commit(request: CommitRequest): Effect {
    const { operationId, amount, idempotencyKey } = request;

    if (idempotencyKey !== undefined) {
      const existingId = this.byKey.get(idempotencyKey);
      if (existingId !== undefined) {
        const existing = this.effects.find((e) => e.effectId === existingId);
        if (existing) return existing;
      }
    }

    const effect: Effect = {
      effectId: `effect_${this.rng.hex(8)}`,
      operationId,
      idempotencyKey,
      amount,
    };
    this.effects.push(effect);
    if (idempotencyKey !== undefined) {
      this.byKey.set(idempotencyKey, effect.effectId);
    }
    return effect;
  }

  /** Acknowledges a committed effect back to the caller. */
  ack(): number {
    this.ackCount += 1;
    return this.ackCount;
  }

  /**
   * Queries the provider for an already-committed effect matching the stable
   * idempotency key. This is the recovery primitive the safe strategy uses to
   * resolve an ambiguous outcome without blindly replaying the write.
   */
  reconcile(idempotencyKey: string): Effect | null {
    this.reconcileCount += 1;
    const effectId = this.byKey.get(idempotencyKey);
    if (effectId === undefined) return null;
    return this.effects.find((e) => e.effectId === effectId) ?? null;
  }

  /** All distinct effects booked for a logical operation. */
  effectsFor(operationId: string): Effect[] {
    return this.effects.filter((e) => e.operationId === operationId);
  }

  get dispatchAttempts(): number {
    return this.dispatchCount;
  }

  get acks(): number {
    return this.ackCount;
  }

  get reconciliations(): number {
    return this.reconcileCount;
  }
}
