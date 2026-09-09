import { describe, expect, it } from "vitest";
import { EventRecorder } from "../lib/event-recorder";
import { FaultInjector } from "../lib/fault-injector";
import { NaiveExecutor } from "../lib/naive-executor";
import { SimulatedProvider } from "../lib/simulated-provider";
import type { FaultPoint } from "../lib/types";

function run(faultPoint: FaultPoint, options: { unavailableAttempts?: number } = {}) {
  const recorder = new EventRecorder();
  const provider = new SimulatedProvider(42, options);
  const faults = new FaultInjector(faultPoint);
  const outcome = new NaiveExecutor().execute({
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
  };
}

describe("NaiveExecutor", () => {
  it("duplicates the effect for AFTER_COMMIT_BEFORE_ACK", () => {
    const { outcome, uniqueEffects, events } = run("AFTER_COMMIT_BEFORE_ACK");
    expect(uniqueEffects).toBe(2);
    expect(outcome.dispatchAttempts).toBe(2);
    expect(outcome.finalState).toBe("CONFIRMED");
    expect(events.some((e) => e.type === "provider.redispatch")).toBe(true);
    expect(events.some((e) => e.type === "reconciliation.started")).toBe(false);
  });

  it("produces exactly one effect on the happy path", () => {
    const { outcome, uniqueEffects } = run("NONE");
    expect(uniqueEffects).toBe(1);
    expect(outcome.dispatchAttempts).toBe(1);
    expect(outcome.finalState).toBe("CONFIRMED");
  });

  it("does not duplicate when the fault is before commit", () => {
    const { uniqueEffects, outcome } = run("BEFORE_COMMIT");
    expect(uniqueEffects).toBe(1);
    expect(outcome.finalState).toBe("CONFIRMED");
  });

  it("does not dispatch when the fault is before dispatch", () => {
    const { uniqueEffects } = run("BEFORE_DISPATCH");
    expect(uniqueEffects).toBe(1);
  });

  it("does not retry for a fault after ack", () => {
    const { outcome, uniqueEffects } = run("AFTER_ACK");
    expect(uniqueEffects).toBe(1);
    expect(outcome.dispatchAttempts).toBe(1);
  });

  it("stops at the retry bound when the provider stays unavailable", () => {
    const { outcome } = run("NONE", { unavailableAttempts: 10 });
    expect(outcome.finalState).toBe("FAILED");
    expect(outcome.dispatchAttempts).toBe(3);
  });
});
