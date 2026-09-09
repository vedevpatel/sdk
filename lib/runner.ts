import { EventRecorder } from "./event-recorder";
import type { ExecutorOutcome } from "./executor";
import { FaultInjector } from "./fault-injector";
import { evaluateInvariants } from "./invariants";
import { NaiveExecutor } from "./naive-executor";
import { SafeExecutor } from "./safe-executor";
import { SimulatedProvider } from "./simulated-provider";
import type {
  CompareResult,
  FaultPoint,
  RunResult,
  Strategy,
} from "./types";
import {
  createRefundAgent,
  type ModelMode,
  resolveModel,
} from "./workflow-agent";

export const DEFAULT_AMOUNT = 42;

export interface RunOptions {
  strategy: Strategy;
  faultPoint: FaultPoint;
  seed: number;
  amount?: number;
  modelMode?: ModelMode;
  maxAttempts?: number;
  /** Test-only: reject this many dispatches with a provider-unavailable error. */
  unavailableAttempts?: number;
}

function operationIdFor(seed: number): string {
  return `op_${seed}`;
}

/**
 * Runs a single scenario end to end: a real WorkflowAgent (driven by a
 * deterministic model by default) issues one refund, and the selected strategy
 * executor applies the durable failure semantics against the simulated
 * provider. Returns the ordered trace plus the evaluated invariants.
 */
export async function runScenario(options: RunOptions): Promise<RunResult> {
  const {
    strategy,
    faultPoint,
    seed,
    amount = DEFAULT_AMOUNT,
    modelMode = "mock",
    maxAttempts,
    unavailableAttempts,
  } = options;

  const operationId = operationIdFor(seed);
  const runId = `run_${strategy}_${faultPoint}_${seed}`;
  const recorder = new EventRecorder();
  const provider = new SimulatedProvider(seed, { unavailableAttempts });
  const faults = new FaultInjector(faultPoint);
  const executor = strategy === "naive" ? new NaiveExecutor() : new SafeExecutor();
  const resolved = resolveModel(modelMode, { operationId, amount });

  recorder.record(
    "run.started",
    `run ${runId} (${strategy}, fault=${faultPoint}, seed=${seed})`,
    { operationId, metadata: { runId, strategy, faultPoint, seed } },
  );
  recorder.record("agent.started", `WorkflowAgent started (${resolved.modelId})`, {
    operationId,
    metadata: { model: resolved.modelId, mode: resolved.mode },
  });

  let outcome: ExecutorOutcome | null = null;

  const agent = createRefundAgent({
    model: resolved.model,
    onIssueRefund: async (args) => {
      recorder.record(
        "tool.requested",
        `agent requested refund for ${args.operationId} ($${args.amount})`,
        { operationId: args.operationId },
      );
      outcome = executor.execute({
        operationId: args.operationId,
        amount: args.amount,
        provider,
        faults,
        recorder,
        maxAttempts,
      });
      return {
        status: outcome.finalState === "CONFIRMED" ? "confirmed" : "failed",
        effectId: outcome.confirmedEffectId,
        dispatchAttempts: outcome.dispatchAttempts,
        finalState: outcome.finalState,
      };
    },
  });

  try {
    await agent.stream({
      prompt: `Refund operation ${operationId} for $${amount}.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "agent error";
    recorder.record("run.failed", `agent run failed: ${message}`, {
      operationId,
    });
  }

  const settled: ExecutorOutcome = outcome ?? {
    finalState: "FAILED",
    dispatchAttempts: provider.dispatchAttempts,
  };
  const uniqueEffects = provider.effectsFor(operationId).length;
  const status = settled.finalState === "CONFIRMED" ? "completed" : "failed";

  const alreadyTerminal = recorder
    .all()
    .some((e) => e.type === "run.completed" || e.type === "run.failed");
  if (!alreadyTerminal) {
    if (status === "completed") {
      recorder.record("run.completed", "run completed successfully", {
        operationId,
        effectId: settled.confirmedEffectId,
      });
    } else {
      recorder.record("run.failed", "run failed to confirm a single effect", {
        operationId,
      });
    }
  }

  const events = recorder.all();
  const invariants = evaluateInvariants({
    operationId,
    events,
    dispatchAttempts: settled.dispatchAttempts,
    uniqueEffects,
    maxAttempts,
  });
  const noDup = invariants.find((i) => i.name === "NO_DUPLICATE_EFFECTS");

  return {
    runId,
    strategy,
    faultPoint,
    seed,
    status,
    dispatchAttempts: settled.dispatchAttempts,
    uniqueEffects,
    finalState: settled.finalState,
    events,
    invariants,
    verdict: noDup?.passed ? "SAFE" : "UNSAFE",
    model: { mode: resolved.mode, modelId: resolved.modelId },
  };
}

/**
 * Runs the naive and safe strategies against an identical fault and seed so the
 * two traces can be compared side by side. This is the default landing demo.
 */
export async function compareScenarios(options: {
  faultPoint: FaultPoint;
  seed: number;
  amount?: number;
  modelMode?: ModelMode;
}): Promise<CompareResult> {
  const naive = await runScenario({ ...options, strategy: "naive" });
  const safe = await runScenario({ ...options, strategy: "safe" });
  return { faultPoint: options.faultPoint, seed: options.seed, naive, safe };
}

/**
 * Reduces a trace to its deterministic, position-independent shape for
 * equality checks in tests.
 */
export function normalizeTrace(events: RunResult["events"]) {
  return events.map((e) => ({
    sequence: e.sequence,
    type: e.type,
    attempt: e.attempt,
  }));
}
