import { describe, expect, it } from "vitest";
import { EventRecorder } from "../lib/event-recorder";
import { FaultInjector } from "../lib/fault-injector";
import { SafeExecutor } from "../lib/safe-executor";
import { SimulatedProvider } from "../lib/simulated-provider";
import type { FaultPoint } from "../lib/types";

function run(faultPoint: FaultPoint, options: { unavailableAttempts?: number } = {}) {
  const recorder = new EventRecorder();
  const provider = new SimulatedProvider(42, options);
  const faults = new FaultInjector(faultPoint);
  const outcome = new SafeExecutor().execute({
    operationId: "op_42",
    amount: 42,
    provider,
    faults,
    recorder,
  });
  return {
    outcome,
    events: recorder.all(),
    uniqueEffects: provider.effectsFor("op_42").length,
    provider,
  };
}

describe("SafeExecutor", () => {
  it("reconciles instead of duplicating for AFTER_COMMIT_BEFORE_ACK", () => {
    const { outcome, uniqueEffects, events, provider } = run(
      "AFTER_COMMIT_BEFORE_ACK",
    );
    expect(uniqueEffects).toBe(1);
    expect(outcome.dispatchAttempts).toBe(1);
    expect(outcome.finalState).toBe("CONFIRMED");
    expect(provider.reconciliations).toBe(1);

    const reconcileIdx = events.findIndex(
      (e) => e.type === "reconciliation.started",
    );
    const foundIdx = events.findIndex((e) => e.type === "reconciliation.found");
    expect(reconcileIdx).toBeGreaterThanOrEqual(0);
    expect(foundIdx).toBeGreaterThan(reconcileIdx);
    expect(events.some((e) => e.type === "provider.redispatch")).toBe(false);
  });

  it("uses a stable idempotency key on every provider interaction", () => {
    const { events } = run("AFTER_COMMIT_BEFORE_ACK");
    const keyed = events.filter((e) => e.idempotencyKey !== undefined);
    expect(keyed.length).toBeGreaterThan(0);
    expect(keyed.every((e) => e.idempotencyKey === "op_42")).toBe(true);
  });

  it("produces exactly one effect on the happy path", () => {
    const { uniqueEffects, outcome } = run("NONE");
    expect(uniqueEffects).toBe(1);
    expect(outcome.finalState).toBe("CONFIRMED");
  });

  it("does not duplicate for a fault before commit", () => {
    const { uniqueEffects, events } = run("BEFORE_COMMIT");
    expect(uniqueEffects).toBe(1);
    // A pre-commit failure is retried directly, without reconciliation.
    expect(events.some((e) => e.type === "reconciliation.started")).toBe(false);
  });

  it("fails cleanly and stays bounded when the provider is unavailable", () => {
    const { outcome, uniqueEffects } = run("NONE", { unavailableAttempts: 10 });
    expect(outcome.finalState).toBe("FAILED");
    expect(outcome.dispatchAttempts).toBe(3);
    expect(uniqueEffects).toBe(0);
  });
});
