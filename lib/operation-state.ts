import type { OperationState } from "./types";

/**
 * The safe operation state machine.
 *
 * Encodes the durable failure semantics from Faultline's design:
 *
 *   CREATED ──▶ DISPATCHING ──▶ CONFIRMED
 *                  │  ▲              ▲
 *                  │  └── retry ─────┤ (only before a possible commit)
 *                  ▼                 │
 *              AMBIGUOUS ── reconcile ┘ (redispatch only if no effect exists)
 *                  │
 *                  ▼
 *               FAILED
 *
 * Rules enforced here:
 *  - an error *before* a possible commit may retry (DISPATCHING → DISPATCHING);
 *  - an error *after* a possible commit is AMBIGUOUS, never a blind retry;
 *  - AMBIGUOUS must be reconciled before any redispatch;
 *  - CONFIRMED and FAILED are terminal.
 */
const TRANSITIONS: Record<OperationState, OperationState[]> = {
  CREATED: ["DISPATCHING", "FAILED"],
  DISPATCHING: ["DISPATCHING", "AMBIGUOUS", "CONFIRMED", "FAILED"],
  AMBIGUOUS: ["DISPATCHING", "CONFIRMED", "FAILED"],
  CONFIRMED: [],
  FAILED: [],
};

export class InvalidTransitionError extends Error {
  constructor(from: OperationState, to: OperationState) {
    super(`invalid operation transition: ${from} -> ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export class OperationStateMachine {
  private current: OperationState = "CREATED";
  private reconciledSinceAmbiguous = false;

  get state(): OperationState {
    return this.current;
  }

  get isTerminal(): boolean {
    return this.current === "CONFIRMED" || this.current === "FAILED";
  }

  private to(next: OperationState): void {
    if (!TRANSITIONS[this.current].includes(next)) {
      throw new InvalidTransitionError(this.current, next);
    }
    this.current = next;
  }

  dispatching(): void {
    // Leaving AMBIGUOUS by dispatching is only legal once reconciliation has
    // proven no effect exists. This is the machine-level guard behind
    // RECONCILE_BEFORE_REPLAY.
    if (this.current === "AMBIGUOUS" && !this.reconciledSinceAmbiguous) {
      throw new InvalidTransitionError(this.current, "DISPATCHING");
    }
    this.to("DISPATCHING");
  }

  markAmbiguous(): void {
    this.to("AMBIGUOUS");
    this.reconciledSinceAmbiguous = false;
  }

  /** Records that reconciliation has run while in the AMBIGUOUS state. */
  reconciled(): void {
    if (this.current !== "AMBIGUOUS") {
      throw new InvalidTransitionError(this.current, "AMBIGUOUS");
    }
    this.reconciledSinceAmbiguous = true;
  }

  confirm(): void {
    this.to("CONFIRMED");
  }

  fail(): void {
    this.to("FAILED");
  }
}
