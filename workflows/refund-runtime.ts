import { getStepMetadata } from "workflow";

/**
 * Runtime experiment (see docs/RUNTIME_EXPERIMENT.md).
 *
 * Unlike the deterministic lab under `lib/`, this file runs a side-effecting
 * operation inside REAL Workflow SDK `"use workflow"` / `"use step"` boundaries.
 * It is compiled and executed by the actual workflow runtime (via
 * `@workflow/vitest`'s in-process Local World) so we can observe genuine
 * step-retry / re-execution semantics after an interruption.
 */

export type RuntimeMode = "naive" | "safe";

export interface RuntimeEffect {
  effectId: string;
  operationId: string;
  /** The runtime-reported attempt on which this effect was committed. */
  attempt: number;
}

interface RuntimeLedger {
  /** Every committed external effect (the "provider" state). */
  effects: RuntimeEffect[];
  /** Total number of times the step body actually ran. */
  stepInvocations: number;
  /** Runtime-reported attempt numbers observed, in order. */
  observedAttempts: number[];
  /** Per-operation local attempt counter used to fire the fault once. */
  localAttempts: Record<string, number>;
  seq: number;
}

const LEDGER_KEY = "__FAULTLINE_RUNTIME_LEDGER__" as const;

type LedgerGlobal = typeof globalThis & { [LEDGER_KEY]?: RuntimeLedger };

function freshLedger(): RuntimeLedger {
  return {
    effects: [],
    stepInvocations: 0,
    observedAttempts: [],
    localAttempts: {},
    seq: 0,
  };
}

/**
 * The external provider's state lives on `globalThis` so it stays observable
 * from the test process even though the compiled step runs from a separately
 * built bundle. Both module copies resolve to the one global object in the
 * single in-process runtime.
 */
function ledger(): RuntimeLedger {
  const g = globalThis as LedgerGlobal;
  return (g[LEDGER_KEY] ??= freshLedger());
}

export function resetRuntimeLedger(): void {
  (globalThis as LedgerGlobal)[LEDGER_KEY] = freshLedger();
}

export function runtimeLedgerSnapshot(): RuntimeLedger {
  const current = ledger();
  return {
    effects: current.effects.map((effect) => ({ ...effect })),
    stepInvocations: current.stepInvocations,
    observedAttempts: [...current.observedAttempts],
    localAttempts: { ...current.localAttempts },
    seq: current.seq,
  };
}

/**
 * The side-effecting step. It commits an external effect, then — on its first
 * invocation for the operation — throws *after* the commit but *before*
 * returning a result. That models a function invocation that crashes after its
 * external write but before it can report success, which the Workflow SDK
 * documents as a step that "executed multiple times" and re-tries per policy.
 */
export async function settleRefund(input: {
  operationId: string;
  amount: number;
  mode: RuntimeMode;
}): Promise<{ effectId: string; attempt: number }> {
  "use step";

  const { operationId, mode } = input;
  const meta = getStepMetadata();
  const store = ledger();

  store.stepInvocations += 1;
  store.observedAttempts.push(meta.attempt);
  store.localAttempts[operationId] = (store.localAttempts[operationId] ?? 0) + 1;
  const localAttempt = store.localAttempts[operationId];

  // Stable idempotency key across retries. The SDK also recommends
  // getStepMetadata().stepId for this; the stable operationId is equivalent
  // here and mirrors the deterministic lab's safe protocol.
  const idempotencyKey = operationId;

  if (mode === "safe") {
    const existing = store.effects.find((e) => e.operationId === idempotencyKey);
    if (existing) {
      // Reconcile-before-replay: the effect already exists from the crashed
      // attempt, so adopt it instead of committing a second one.
      return { effectId: existing.effectId, attempt: meta.attempt };
    }
  }

  // Commit the external side effect.
  store.seq += 1;
  const effectId = `effect_${mode}_${store.seq}`;
  store.effects.push({ effectId, operationId, attempt: meta.attempt });

  // Interruption boundary: commit done, result not yet reported.
  if (localAttempt === 1) {
    throw new Error(
      `injected crash after commit, before ack (operation ${operationId})`,
    );
  }

  return { effectId, attempt: meta.attempt };
}

/**
 * The durable workflow. It orchestrates a single refund step. The workflow
 * function itself is deterministic and sandboxed; all side effects live in the
 * step.
 */
export async function refundRuntimeWorkflow(
  operationId: string,
  amount: number,
  mode: RuntimeMode,
): Promise<{ effectId: string; attempt: number }> {
  "use workflow";

  const result = await settleRefund({ operationId, amount, mode });
  return result;
}
