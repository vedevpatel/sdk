import {
  MAX_ATTEMPTS,
  type Executor,
  type ExecutorContext,
  type ExecutorOutcome,
} from "./executor";
import { InjectedFaultError } from "./fault-injector";
import { ProviderUnavailableError } from "./simulated-provider";

/**
 * The naive retry strategy.
 *
 * On any failure it blindly re-runs the tool call. It does not carry a stable
 * idempotency key and never reconciles before replaying. When a fault lands
 * *after* the remote commit but before the acknowledgment, the retry dispatches
 * and commits a second, duplicate side effect. This is intentionally unsafe and
 * is expected to fail NO_DUPLICATE_EFFECTS for AFTER_COMMIT_BEFORE_ACK.
 */
export class NaiveExecutor implements Executor {
  readonly strategy = "naive" as const;

  execute(ctx: ExecutorContext): ExecutorOutcome {
    const { operationId, amount, provider, faults, recorder } = ctx;
    const maxAttempts = ctx.maxAttempts ?? MAX_ATTEMPTS;

    recorder.record("operation.created", `logical operation ${operationId}`, {
      operationId,
      metadata: { idempotencyKey: null },
    });

    let attempt = 0;

    for (;;) {
      attempt += 1;
      try {
        if (faults.shouldInject("BEFORE_DISPATCH", attempt)) {
          recorder.record("fault.injected", "fault before dispatch", {
            attempt,
            operationId,
            metadata: { phase: "BEFORE_DISPATCH", ambiguous: false },
          });
          throw new InjectedFaultError("BEFORE_DISPATCH", false);
        }

        const dispatchNo = provider.dispatch();
        recorder.record(
          attempt === 1 ? "provider.dispatch" : "provider.redispatch",
          `dispatch #${dispatchNo}`,
          { attempt, operationId, metadata: { dispatchNo } },
        );

        if (faults.shouldInject("BEFORE_COMMIT", attempt)) {
          recorder.record("fault.injected", "fault before commit", {
            attempt,
            operationId,
            metadata: { phase: "BEFORE_COMMIT", ambiguous: false },
          });
          throw new InjectedFaultError("BEFORE_COMMIT", false);
        }

        // Naive: no idempotency key, so every commit books a fresh effect.
        const effect = provider.commit({ operationId, amount });
        recorder.record("provider.commit", `committed ${effect.effectId}`, {
          attempt,
          operationId,
          effectId: effect.effectId,
        });

        if (faults.shouldInject("AFTER_COMMIT_BEFORE_ACK", attempt)) {
          recorder.record(
            "fault.injected",
            "acknowledgment lost after commit",
            {
              attempt,
              operationId,
              effectId: effect.effectId,
              metadata: { phase: "AFTER_COMMIT_BEFORE_ACK", ambiguous: true },
            },
          );
          throw new InjectedFaultError("AFTER_COMMIT_BEFORE_ACK", true);
        }

        provider.ack();
        recorder.record("provider.ack", "acknowledgment received", {
          attempt,
          operationId,
          effectId: effect.effectId,
        });

        // A fault after the ack does not trigger a retry: success is already
        // durably recorded, so there is no duplicate.
        if (faults.shouldInject("AFTER_ACK", attempt)) {
          recorder.record(
            "fault.injected",
            "fault after ack (operation already confirmed)",
            {
              attempt,
              operationId,
              effectId: effect.effectId,
              metadata: { phase: "AFTER_ACK", ambiguous: false },
            },
          );
        }

        recorder.record("tool.completed", "refund confirmed", {
          attempt,
          operationId,
          effectId: effect.effectId,
        });
        return {
          finalState: "CONFIRMED",
          dispatchAttempts: provider.dispatchAttempts,
          confirmedEffectId: effect.effectId,
        };
      } catch (error) {
        const reason =
          error instanceof ProviderUnavailableError
            ? "provider unavailable"
            : error instanceof InjectedFaultError
              ? error.message
              : "unknown error";

        if (attempt >= maxAttempts) {
          recorder.record(
            "tool.completed",
            `giving up after ${attempt} attempts (${reason})`,
            {
              attempt,
              operationId,
              metadata: { failed: true, reason },
            },
          );
          return {
            finalState: "FAILED",
            dispatchAttempts: provider.dispatchAttempts,
          };
        }

        // The unsafe move: retry without reconciling.
        recorder.record("retry.started", `retrying after ${reason}`, {
          attempt: attempt + 1,
          operationId,
          metadata: { reason },
        });
      }
    }
  }
}
