# Runtime experiment: real Workflow SDK interruption & re-execution

The main Faultline lab (`lib/`) models retry semantics in its own executor loop
so the demo is fully deterministic and needs no runtime. That leaves one
credibility gap: does a **real** durable runtime actually re-execute a
side-effecting step after an interruption between the external commit and the
recorded result?

This experiment closes that gap with a single integration test that runs an
actual Workflow SDK workflow through the real runtime — no changes to the
deterministic lab.

- Code: [`workflows/refund-runtime.ts`](../workflows/refund-runtime.ts)
- Test: [`workflows/refund-runtime.integration.test.ts`](../workflows/refund-runtime.integration.test.ts)
- Config: [`vitest.workflow.config.mts`](../vitest.workflow.config.mts)
- Run: `pnpm test:runtime`

## What real runtime behavior was exercised

The test uses [`@workflow/vitest`](https://www.npmjs.com/package/@workflow/vitest),
the SDK's own in-process integration-test harness. It is not a mock:

- It SWC-compiles the real `"use workflow"` / `"use step"` directives.
- It builds the workflow/step runtime bundles.
- It runs them against a real **Local World** runtime instance (the same
  durable backend used for `workflow` local development), in-process.

A workflow (`refundRuntimeWorkflow`) orchestrates one side-effecting step
(`settleRefund`). The step commits an effect to an external ledger, then throws
**after** the commit but **before** returning a result. The runtime observes the
failure and re-invokes the step under its own retry policy (default:
`maxRetries = 3`). Execution is driven entirely by `start()` from `workflow/api`
and awaited via `run.returnValue` / `run.status`.

## Exact interruption boundary

Inside the step, in this order:

1. `getStepMetadata()` reads the runtime-assigned `attempt`.
2. The external effect is committed to the ledger (the "provider write").
3. **Interruption:** on the first invocation the step throws
   `Error("injected crash after commit, before ack ...")` — i.e. the external
   write has landed, but the step never reports success.
4. The runtime re-enqueues and re-invokes the step (attempt 2), which completes
   and reports its result, so the workflow finishes.

This is the boundary the SDK documents in
[*Step executed multiple times*](https://workflow-sdk.dev/docs/errors/step-executed-multiple-times):
"if the function invocation executing the step crashes unexpectedly, and the
step can not report the error \[...] the step will be re-tried according to your
retry policy."

## Observed result

Captured from a run (`observedAttempts` are the runtime's own `attempt` values):

| Variant | Step invocations | Runtime attempts | Effects committed | Outcome |
| --- | --- | --- | --- | --- |
| Naive (keyless commit) | 2 | `[1, 2]` | `effect_naive_1`, `effect_naive_2` | **duplicate** side effect |
| Safe (idempotency key + reconcile) | 2 | `[1, 2]` | `effect_safe_1` | **single** side effect |

Key points:

- **The runtime really re-executed the step.** `stepInvocations === 2` and the
  runtime-reported `attempt` advanced `1 → 2`. Neither number is produced by our
  code; the runtime chose to re-invoke after the throw.
- **Naive duplicates.** Because the naive commit carries no idempotency key, the
  re-execution booked a second, distinct effect for one logical operation —
  exactly the failure the deterministic lab predicts, now shown end-to-end
  through the real runtime.
- **Idempotency fixes it.** The safe step ran the same two times, but keyed the
  commit on the stable `operationId` and reconciled on re-entry, so the ledger
  held exactly one effect.

All three assertions pass:

```
$ pnpm test:runtime
 Test Files  1 passed (1)
      Tests  3 passed (3)
```

## Limitations

- **Retry, not a process kill.** The interruption is a throw after the side
  effect, which drives the runtime's genuine re-execution path. It is not an OS
  process being killed and replayed from the event log. Per the SDK docs above,
  a real crash-before-report resolves to the same retry/re-execution behavior,
  so this faithfully reproduces the semantics without faking a restart.
- **In-process Local World.** The test uses the local durable backend, not
  Vercel's managed infrastructure. Behavior of managed/Postgres worlds is not
  claimed here.
- **The provider is still simulated.** The "external effect" is an in-process
  ledger on `globalThis`, observed as the external system would be. No real
  network or money.
- **Not a Vercel/SDK defect.** This demonstrates documented, expected
  at-least-once step execution. It is **not** a bug report. The SDK's own
  [Idempotency guide](https://workflow-sdk.dev/docs/foundations/idempotency)
  and `getStepMetadata().stepId` exist precisely to make step side effects
  idempotent.

## Does this materially strengthen the project?

Yes, modestly and specifically. It converts the central claim from "modeled in
our executor" to "observed in the real Workflow SDK runtime": a real step, at a
real step boundary, was re-executed after a post-commit interruption, and a
naive commit produced a duplicate while the idempotent + reconcile protocol did
not. It does not change the deterministic lab, and it does not assert any SDK
defect — it validates that Faultline's safe protocol is the right answer to a
behavior the runtime genuinely exhibits.

## Environment

| Package | Version |
| --- | --- |
| `workflow` | 5.0.0-beta.48 |
| `@workflow/core` | 5.0.0-beta.48 |
| `@workflow/world-local` | 5.0.0-beta.42 |
| `@workflow/vitest` | 5.0.0-beta.50 |
| `@ai-sdk/workflow` | 2.0.27 |
| `ai` | 7.0.96 |
| `vitest` | 5.0.0 |
| Node.js | 22 |

## Reproduce

```bash
pnpm install
pnpm test:runtime
```
