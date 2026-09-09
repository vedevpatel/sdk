import type { FaultPoint } from "./types";

/**
 * Lifecycle phases at which the executor consults the fault injector.
 *
 * These map onto the provider's side-effecting steps so a fault can be placed
 * precisely relative to the remote commit and acknowledgment.
 */
export type FaultPhase =
  | "BEFORE_DISPATCH"
  | "BEFORE_COMMIT"
  | "AFTER_COMMIT_BEFORE_ACK"
  | "AFTER_ACK";

/**
 * Deterministic, single-shot fault injector.
 *
 * A fault is injected exactly once, on the configured attempt (the first
 * attempt by default), at exactly one lifecycle phase. Subsequent attempts see
 * no fault, which guarantees every scenario terminates. Injection depends only
 * on the configured `faultPoint` and attempt number — never on wall-clock time
 * or `Math.random()`.
 */
export class FaultInjector {
  private readonly faultPoint: FaultPoint;
  private readonly faultAttempt: number;
  private consumed = false;

  constructor(faultPoint: FaultPoint, options: { faultAttempt?: number } = {}) {
    this.faultPoint = faultPoint;
    this.faultAttempt = options.faultAttempt ?? 1;
  }

  /**
   * Returns true when a fault should fire at this phase on this attempt.
   * The fault is consumed so it can only fire once for the whole run.
   */
  shouldInject(phase: FaultPhase, attempt: number): boolean {
    if (this.consumed) return false;
    if (this.faultPoint === "NONE") return false;
    if (attempt !== this.faultAttempt) return false;
    if (this.faultPoint !== phase) return false;
    this.consumed = true;
    return true;
  }

  get injectsAfterPossibleCommit(): boolean {
    return this.faultPoint === "AFTER_COMMIT_BEFORE_ACK";
  }
}

/** Raised when a fault interrupts the tool call between two lifecycle steps. */
export class InjectedFaultError extends Error {
  readonly phase: FaultPhase;
  /** True when the remote side effect may already have committed. */
  readonly afterPossibleCommit: boolean;

  constructor(phase: FaultPhase, afterPossibleCommit: boolean) {
    super(`fault injected at ${phase}`);
    this.name = "InjectedFaultError";
    this.phase = phase;
    this.afterPossibleCommit = afterPossibleCommit;
  }
}
