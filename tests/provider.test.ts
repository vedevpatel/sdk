import { describe, expect, it } from "vitest";
import {
  ProviderUnavailableError,
  SimulatedProvider,
} from "../lib/simulated-provider";

describe("SimulatedProvider", () => {
  it("is deterministic for a given seed", () => {
    const a = new SimulatedProvider(42);
    const b = new SimulatedProvider(42);
    a.dispatch();
    b.dispatch();
    const ea = a.commit({ operationId: "op_42", amount: 42 });
    const eb = b.commit({ operationId: "op_42", amount: 42 });
    expect(ea.effectId).toBe(eb.effectId);
  });

  it("books a new effect on every keyless commit (naive behavior)", () => {
    const provider = new SimulatedProvider(1);
    const e1 = provider.commit({ operationId: "op_1", amount: 42 });
    const e2 = provider.commit({ operationId: "op_1", amount: 42 });
    expect(e1.effectId).not.toBe(e2.effectId);
    expect(provider.effectsFor("op_1")).toHaveLength(2);
  });

  it("resolves the same idempotency key to the same effect (safe behavior)", () => {
    const provider = new SimulatedProvider(1);
    const e1 = provider.commit({
      operationId: "op_1",
      amount: 42,
      idempotencyKey: "op_1",
    });
    const e2 = provider.commit({
      operationId: "op_1",
      amount: 42,
      idempotencyKey: "op_1",
    });
    expect(e1.effectId).toBe(e2.effectId);
    expect(provider.effectsFor("op_1")).toHaveLength(1);
  });

  it("reconciles an existing effect by idempotency key", () => {
    const provider = new SimulatedProvider(7);
    const committed = provider.commit({
      operationId: "op_7",
      amount: 42,
      idempotencyKey: "op_7",
    });
    expect(provider.reconcile("op_7")?.effectId).toBe(committed.effectId);
    expect(provider.reconcile("missing")).toBeNull();
  });

  it("rejects dispatch while configured as unavailable", () => {
    const provider = new SimulatedProvider(1, { unavailableAttempts: 2 });
    expect(() => provider.dispatch()).toThrow(ProviderUnavailableError);
    expect(() => provider.dispatch()).toThrow(ProviderUnavailableError);
    expect(provider.dispatch()).toBe(3);
  });
});
