import { beforeEach, describe, expect, it } from "vitest";
import { start } from "workflow/api";
import {
  refundRuntimeWorkflow,
  resetRuntimeLedger,
  runtimeLedgerSnapshot,
} from "./refund-runtime";

/**
 * Runtime experiment: exercises the REAL Workflow SDK runtime (in-process Local
 * World via @workflow/vitest). A step commits an external effect, then crashes
 * after the commit but before reporting success. The runtime re-executes the
 * step. We observe whether the external effect duplicates.
 *
 * See docs/RUNTIME_EXPERIMENT.md.
 */
describe("Workflow SDK runtime: interruption after commit, before result", () => {
  beforeEach(() => {
    resetRuntimeLedger();
  });

  it("re-executes the step through the real runtime after a post-commit crash", async () => {
    const run = await start(refundRuntimeWorkflow, [
      "op_naive_runtime",
      42,
      "naive",
    ]);
    expect(run.runId).toMatch(/^wrun_/);
    await run.returnValue;

    const ledger = runtimeLedgerSnapshot();
    // The runtime genuinely invoked the step body more than once.
    expect(ledger.stepInvocations).toBe(2);
    // Runtime-reported attempt numbers increased across the retry.
    expect(ledger.observedAttempts).toHaveLength(2);
    expect(ledger.observedAttempts[1]).toBeGreaterThan(
      ledger.observedAttempts[0]!,
    );
    expect(await run.status).toBe("completed");
  });

  it("naive step duplicates the external effect on retry", async () => {
    const run = await start(refundRuntimeWorkflow, [
      "op_naive_runtime",
      42,
      "naive",
    ]);
    await run.returnValue;

    const ledger = runtimeLedgerSnapshot();
    expect(ledger.stepInvocations).toBe(2);
    // Two distinct external effects for one logical operation: a duplicate.
    expect(ledger.effects).toHaveLength(2);
    expect(new Set(ledger.effects.map((e) => e.effectId)).size).toBe(2);
  });

  it("idempotent step keeps a single external effect across the same retry", async () => {
    const run = await start(refundRuntimeWorkflow, [
      "op_safe_runtime",
      42,
      "safe",
    ]);
    await run.returnValue;

    const ledger = runtimeLedgerSnapshot();
    // Same real re-execution boundary (step ran twice) ...
    expect(ledger.stepInvocations).toBe(2);
    // ... but the idempotency key + reconcile collapses it to one effect.
    expect(ledger.effects).toHaveLength(1);
    expect(await run.status).toBe("completed");
  });
});
