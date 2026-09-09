import { MAX_ATTEMPTS } from "./executor";
import type { Invariant, RunEvent } from "./types";

export interface InvariantInput {
  operationId: string;
  events: RunEvent[];
  dispatchAttempts: number;
  uniqueEffects: number;
  maxAttempts?: number;
}

/**
 * Evaluates the five durability invariants against a completed run.
 *
 * The naive AFTER_COMMIT_BEFORE_ACK scenario is *expected* to fail
 * NO_DUPLICATE_EFFECTS and RECONCILE_BEFORE_REPLAY — that failure is the point
 * of the lab, not a bug in the evaluator.
 */
export function evaluateInvariants(input: InvariantInput): Invariant[] {
  const { operationId, events, dispatchAttempts, uniqueEffects } = input;
  const maxAttempts = input.maxAttempts ?? MAX_ATTEMPTS;

  return [
    noDuplicateEffects(uniqueEffects),
    stableOperationId(operationId, events),
    boundedRetries(dispatchAttempts, maxAttempts),
    singleTerminalState(events),
    reconcileBeforeReplay(events),
  ];
}

function noDuplicateEffects(uniqueEffects: number): Invariant {
  const passed = uniqueEffects <= 1;
  return {
    name: "NO_DUPLICATE_EFFECTS",
    passed,
    explanation: passed
      ? `The logical operation produced ${uniqueEffects} side effect${
          uniqueEffects === 1 ? "" : "s"
        }.`
      : `The logical operation produced ${uniqueEffects} distinct side effects; the action was duplicated.`,
  };
}

function stableOperationId(
  operationId: string,
  events: RunEvent[],
): Invariant {
  const withOperation = events.filter((e) => e.operationId !== undefined);
  const drift = withOperation.filter((e) => e.operationId !== operationId);
  const passed = drift.length === 0;
  return {
    name: "STABLE_OPERATION_ID",
    passed,
    explanation: passed
      ? `Every operation-scoped event used the stable id ${operationId} across all ${
          countAttempts(events)
        } attempt(s).`
      : `Found ${drift.length} event(s) with a divergent operation id.`,
  };
}

function boundedRetries(
  dispatchAttempts: number,
  maxAttempts: number,
): Invariant {
  const passed = dispatchAttempts <= maxAttempts;
  return {
    name: "BOUNDED_RETRIES",
    passed,
    explanation: passed
      ? `Dispatch attempts (${dispatchAttempts}) stayed within the bound of ${maxAttempts}.`
      : `Dispatch attempts (${dispatchAttempts}) exceeded the bound of ${maxAttempts}.`,
  };
}

function singleTerminalState(events: RunEvent[]): Invariant {
  const terminal = events.filter(
    (e) => e.type === "run.completed" || e.type === "run.failed",
  );
  const passed = terminal.length === 1;
  return {
    name: "SINGLE_TERMINAL_STATE",
    passed,
    explanation: passed
      ? `The run reached exactly one terminal state (${terminal[0]?.type}).`
      : `The run reached ${terminal.length} terminal states; expected exactly one.`,
  };
}

/**
 * A redispatch that follows an ambiguous (possibly-committed) failure must be
 * preceded by a reconciliation. Redispatches after a known pre-commit failure
 * are safe and do not require reconciliation.
 */
function reconcileBeforeReplay(events: RunEvent[]): Invariant {
  let pendingAmbiguous = false;
  let violation = false;

  for (const event of events) {
    if (
      event.type === "fault.injected" &&
      event.metadata?.ambiguous === true
    ) {
      pendingAmbiguous = true;
    } else if (event.type === "reconciliation.started") {
      pendingAmbiguous = false;
    } else if (event.type === "provider.redispatch" && pendingAmbiguous) {
      violation = true;
      break;
    }
  }

  return {
    name: "RECONCILE_BEFORE_REPLAY",
    passed: !violation,
    explanation: violation
      ? "A redispatch replayed a possibly-committed operation without reconciling first."
      : "No possibly-committed operation was replayed without reconciliation.",
  };
}

function countAttempts(events: RunEvent[]): number {
  return events.reduce((max, e) => Math.max(max, e.attempt), 0);
}
