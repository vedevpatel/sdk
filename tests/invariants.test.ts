import { describe, expect, it } from "vitest";
import { evaluateInvariants } from "../lib/invariants";
import type { InvariantName, RunEvent } from "../lib/types";

let seq = 0;
function ev(partial: Partial<RunEvent> & { type: RunEvent["type"] }): RunEvent {
  return {
    sequence: seq++,
    attempt: 1,
    message: "",
    ...partial,
  };
}

function get(name: InvariantName, events: RunEvent[], extra: Partial<{
  dispatchAttempts: number;
  uniqueEffects: number;
  maxAttempts: number;
}> = {}) {
  const result = evaluateInvariants({
    operationId: "op_42",
    events,
    dispatchAttempts: extra.dispatchAttempts ?? 1,
    uniqueEffects: extra.uniqueEffects ?? 1,
    maxAttempts: extra.maxAttempts ?? 3,
  });
  const found = result.find((i) => i.name === name);
  if (!found) throw new Error(`invariant ${name} missing`);
  return found;
}

describe("evaluateInvariants", () => {
  it("flags duplicate effects", () => {
    expect(get("NO_DUPLICATE_EFFECTS", [], { uniqueEffects: 2 }).passed).toBe(
      false,
    );
    expect(get("NO_DUPLICATE_EFFECTS", [], { uniqueEffects: 1 }).passed).toBe(
      true,
    );
  });

  it("detects operation id drift", () => {
    const stable = [ev({ type: "provider.commit", operationId: "op_42" })];
    const drift = [ev({ type: "provider.commit", operationId: "op_99" })];
    expect(get("STABLE_OPERATION_ID", stable).passed).toBe(true);
    expect(get("STABLE_OPERATION_ID", drift).passed).toBe(false);
  });

  it("enforces the retry bound", () => {
    expect(get("BOUNDED_RETRIES", [], { dispatchAttempts: 3 }).passed).toBe(true);
    expect(get("BOUNDED_RETRIES", [], { dispatchAttempts: 4 }).passed).toBe(
      false,
    );
  });

  it("requires exactly one terminal state", () => {
    expect(get("SINGLE_TERMINAL_STATE", [ev({ type: "run.completed" })]).passed).toBe(
      true,
    );
    expect(get("SINGLE_TERMINAL_STATE", []).passed).toBe(false);
    expect(
      get("SINGLE_TERMINAL_STATE", [
        ev({ type: "run.completed" }),
        ev({ type: "run.failed" }),
      ]).passed,
    ).toBe(false);
  });

  it("fails RECONCILE_BEFORE_REPLAY when a possibly-committed op is replayed blindly", () => {
    const events = [
      ev({ type: "fault.injected", metadata: { ambiguous: true } }),
      ev({ type: "provider.redispatch" }),
    ];
    expect(get("RECONCILE_BEFORE_REPLAY", events).passed).toBe(false);
  });

  it("passes RECONCILE_BEFORE_REPLAY when reconciliation precedes any replay", () => {
    const events = [
      ev({ type: "fault.injected", metadata: { ambiguous: true } }),
      ev({ type: "reconciliation.started" }),
      ev({ type: "reconciliation.empty" }),
      ev({ type: "provider.redispatch" }),
    ];
    expect(get("RECONCILE_BEFORE_REPLAY", events).passed).toBe(true);
  });

  it("passes RECONCILE_BEFORE_REPLAY for pre-commit redispatch", () => {
    const events = [
      ev({ type: "fault.injected", metadata: { ambiguous: false } }),
      ev({ type: "provider.redispatch" }),
    ];
    expect(get("RECONCILE_BEFORE_REPLAY", events).passed).toBe(true);
  });
});
