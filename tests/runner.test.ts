import { describe, expect, it } from "vitest";
import { runRequestSchema } from "../lib/schema";
import { compareScenarios, normalizeTrace, runScenario } from "../lib/runner";
import { FAULT_POINTS, STRATEGIES } from "../lib/types";

describe("runner: full fault x strategy matrix", () => {
  for (const strategy of STRATEGIES) {
    for (const faultPoint of FAULT_POINTS) {
      it(`${strategy} + ${faultPoint} reaches a single terminal state`, async () => {
        const result = await runScenario({ strategy, faultPoint, seed: 42 });
        const terminal = result.events.filter(
          (e) => e.type === "run.completed" || e.type === "run.failed",
        );
        expect(terminal).toHaveLength(1);
        expect(
          result.invariants.find((i) => i.name === "SINGLE_TERMINAL_STATE")
            ?.passed,
        ).toBe(true);
        expect(
          result.invariants.find((i) => i.name === "BOUNDED_RETRIES")?.passed,
        ).toBe(true);
      });
    }
  }
});

describe("runner: critical assertions", () => {
  it("naive + AFTER_COMMIT_BEFORE_ACK duplicates the effect", async () => {
    const result = await runScenario({
      strategy: "naive",
      faultPoint: "AFTER_COMMIT_BEFORE_ACK",
      seed: 42,
    });
    expect(result.uniqueEffects).toBe(2);
    expect(result.dispatchAttempts).toBe(2);
    expect(result.verdict).toBe("UNSAFE");
    expect(
      result.invariants.find((i) => i.name === "NO_DUPLICATE_EFFECTS")?.passed,
    ).toBe(false);
    expect(
      result.invariants.find((i) => i.name === "RECONCILE_BEFORE_REPLAY")
        ?.passed,
    ).toBe(false);
  });

  it("safe + AFTER_COMMIT_BEFORE_ACK keeps a single effect", async () => {
    const result = await runScenario({
      strategy: "safe",
      faultPoint: "AFTER_COMMIT_BEFORE_ACK",
      seed: 42,
    });
    expect(result.uniqueEffects).toBe(1);
    expect(result.verdict).toBe("SAFE");
    expect(
      result.invariants.find((i) => i.name === "NO_DUPLICATE_EFFECTS")?.passed,
    ).toBe(true);
    expect(
      result.invariants.find((i) => i.name === "RECONCILE_BEFORE_REPLAY")
        ?.passed,
    ).toBe(true);
  });

  it("BEFORE_COMMIT never duplicates under either strategy", async () => {
    for (const strategy of STRATEGIES) {
      const result = await runScenario({
        strategy,
        faultPoint: "BEFORE_COMMIT",
        seed: 42,
      });
      expect(result.uniqueEffects).toBe(1);
    }
  });

  it("NONE produces one effect and passes all invariants", async () => {
    for (const strategy of STRATEGIES) {
      const result = await runScenario({
        strategy,
        faultPoint: "NONE",
        seed: 42,
      });
      expect(result.uniqueEffects).toBe(1);
      expect(result.status).toBe("completed");
      expect(result.invariants.every((i) => i.passed)).toBe(true);
    }
  });

  it("produces an identical normalized trace for the same seed + scenario", async () => {
    const a = await runScenario({
      strategy: "safe",
      faultPoint: "AFTER_COMMIT_BEFORE_ACK",
      seed: 42,
    });
    const b = await runScenario({
      strategy: "safe",
      faultPoint: "AFTER_COMMIT_BEFORE_ACK",
      seed: 42,
    });
    expect(normalizeTrace(a.events)).toEqual(normalizeTrace(b.events));
    expect(a.events).toEqual(b.events);
  });

  it("respects the retry limit when the provider is unavailable", async () => {
    const result = await runScenario({
      strategy: "safe",
      faultPoint: "NONE",
      seed: 42,
      unavailableAttempts: 10,
    });
    expect(result.status).toBe("failed");
    expect(result.dispatchAttempts).toBe(3);
    expect(
      result.invariants.find((i) => i.name === "BOUNDED_RETRIES")?.passed,
    ).toBe(true);
  });

  it("compares both strategies with identical fault and seed", async () => {
    const comparison = await compareScenarios({
      faultPoint: "AFTER_COMMIT_BEFORE_ACK",
      seed: 42,
    });
    expect(comparison.naive.verdict).toBe("UNSAFE");
    expect(comparison.safe.verdict).toBe("SAFE");
    expect(comparison.naive.uniqueEffects).toBe(2);
    expect(comparison.safe.uniqueEffects).toBe(1);
  });
});

describe("runner: request schema", () => {
  it("accepts a well-formed request", () => {
    const parsed = runRequestSchema.safeParse({
      strategy: "safe",
      faultPoint: "NONE",
      seed: 42,
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects malformed requests", () => {
    expect(
      runRequestSchema.safeParse({
        strategy: "bogus",
        faultPoint: "NONE",
        seed: 42,
      }).success,
    ).toBe(false);
    expect(
      runRequestSchema.safeParse({
        strategy: "safe",
        faultPoint: "NOPE",
        seed: 42,
      }).success,
    ).toBe(false);
    expect(
      runRequestSchema.safeParse({
        strategy: "safe",
        faultPoint: "NONE",
        seed: 1.5,
      }).success,
    ).toBe(false);
  });
});
