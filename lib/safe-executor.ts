import {
  MAX_ATTEMPTS,
  type Executor,
  type ExecutorContext,
  type ExecutorOutcome,
} from "./executor";
import { InjectedFaultError } from "./fault-injector";
import { OperationStateMachine } from "./operation-state";
import { ProviderUnavailableError } from "./simulated-provider";

/**
 * The safe strategy: stable operation identity, idempotency key, and
 * reconcile-before-replay.
 *
 * A stable idempotency key (the operationId) is attached to every commit, and
 * the operation is driven through an explicit state machine. When a fault lands
 * after a *possible* commit, the operation becomes AMBIGUOUS and the executor
 * reconciles with the provider before doing anything else. If an effect already
 * exists it is adopted and no second effect is booked, so the logical operation
 * produces exactly one side effect.
 */
export class SafeExecutor implements Executor {
  readonly strategy = "safe" as const;

  execute(ctx: ExecutorContext): ExecutorOutcome {
    const { operationId, amount, provider, faults, recorder } = ctx;
    const maxAttempts = ctx.maxAttempts ?? MAX_ATTEMPTS;
    const idempotencyKey = operationId;
    const machine = new OperationStateMachine();

    recorder.record(
      "operation.created",
      `operation ${operationId} created with stable idempotency key`,
      { operationId, idempotencyKey, metadata: { state: machine.state } },
    );

    let attempt = 0;

    for (;;) {
      attempt += 1;
      try {
        if (faults.shouldInject("BEFORE_DISPATCH", attempt)) {
          recorder.record("fault.injected", "fault before dispatch", {
            attempt,
            operationId,
            idempotencyKey,
            metadata: { phase: "BEFORE_DISPATCH", ambiguous: false },
          });
          throw new InjectedFaultError("BEFORE_DISPATCH", false);
        }

        machine.dispatching();
        const dispatchNo = provider.dispatch();
        recorder.record(
          attempt === 1 ? "provider.dispatch" : "provider.redispatch",
          `dispatch #${dispatchNo} using idempotencyKey=${idempotencyKey}`,
          {
            attempt,
            operationId,
            idempotencyKey,
            metadata: { dispatchNo, state: machine.state },
          },
        );

        if (faults.shouldInject("BEFORE_COMMIT", attempt)) {
          recorder.record("fault.injected", "fault before commit", {
            attempt,
            operationId,
            idempotencyKey,
            metadata: { phase: "BEFORE_COMMIT", ambiguous: false },
          });
          throw new InjectedFaultError("BEFORE_COMMIT", false);
        }

        const effect = provider.commit({ operationId, amount, idempotencyKey });
        recorder.record("provider.commit", `committed ${effect.effectId}`, {
          attempt,
          operationId,
          idempotencyKey,
          effectId: effect.effectId,
        });

        if (faults.shouldInject("AFTER_COMMIT_BEFORE_ACK", attempt)) {
          recorder.record(
            "fault.injected",
            "acknowledgment lost after commit",
            {
              attempt,
              operationId,
              idempotencyKey,
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
          idempotencyKey,
          effectId: effect.effectId,
        });

        if (faults.shouldInject("AFTER_ACK", attempt)) {
          recorder.record(
            "fault.injected",
            "fault after ack (operation already confirmed)",
            {
              attempt,
              operationId,
              idempotencyKey,
              effectId: effect.effectId,
              metadata: { phase: "AFTER_ACK", ambiguous: false },
            },
          );
        }

        machine.confirm();
        recorder.record("tool.completed", "refund confirmed", {
          attempt,
          operationId,
          idempotencyKey,
          effectId: effect.effectId,
          metadata: { state: machine.state },
        });
        return {
          finalState: machine.state,
          dispatchAttempts: provider.dispatchAttempts,
          confirmedEffectId: effect.effectId,
        };
      } catch (error) {
        const afterPossibleCommit =
          error instanceof InjectedFaultError && error.afterPossibleCommit;
        const reason =
          error instanceof ProviderUnavailableError
            ? "provider unavailable"
            : error instanceof InjectedFaultError
              ? error.message
              : "unknown error";

        if (afterPossibleCommit) {
          // The write may have committed but the ack was lost: enter the
          // AMBIGUOUS state and reconcile before doing anything else.
          machine.markAmbiguous();
          recorder.record(
            "reconciliation.started",
            `ambiguous outcome; reconciling using idempotencyKey=${idempotencyKey}`,
            {
              attempt,
              operationId,
              idempotencyKey,
              metadata: { state: machine.state },
            },
          );
          const found = provider.reconcile(idempotencyKey);
          machine.reconciled();

          if (found) {
            recorder.record(
              "reconciliation.found",
              `existing effect ${found.effectId} discovered; no resend`,
              {
                attempt,
                operationId,
                idempotencyKey,
                effectId: found.effectId,
              },
            );
            machine.confirm();
            recorder.record("tool.completed", "refund confirmed", {
              attempt,
              operationId,
              idempotencyKey,
              effectId: found.effectId,
              metadata: { state: machine.state },
            });
            return {
              finalState: machine.state,
              dispatchAttempts: provider.dispatchAttempts,
              confirmedEffectId: found.effectId,
            };
          }

          recorder.record(
            "reconciliation.empty",
            "no existing effect found; redispatch is safe",
            { attempt, operationId, idempotencyKey },
          );
        }

        if (attempt >= maxAttempts) {
          machine.fail();
          recorder.record(
            "tool.completed",
            `giving up after ${attempt} attempts (${reason})`,
            {
              attempt,
              operationId,
              idempotencyKey,
              metadata: { failed: true, reason, state: machine.state },
            },
          );
          return {
            finalState: machine.state,
            dispatchAttempts: provider.dispatchAttempts,
          };
        }

        recorder.record("retry.started", `retrying after ${reason}`, {
          attempt: attempt + 1,
          operationId,
          idempotencyKey,
          metadata: { reason, state: machine.state },
        });
      }
    }
  }
}
