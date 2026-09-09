/**
 * Shared domain types for Faultline.
 *
 * Faultline is a deterministic failure lab for durable AI-agent tool calls.
 * These types describe the run request/response contract, the ordered event
 * model, and the invariants that are evaluated against every run.
 */

export const STRATEGIES = ["naive", "safe"] as const;
export type Strategy = (typeof STRATEGIES)[number];

/**
 * The point in the tool-call lifecycle where a fault is injected.
 *
 * The centerpiece is `AFTER_COMMIT_BEFORE_ACK`: the external side effect has
 * already been committed, but the acknowledgment never reaches the workflow.
 */
export const FAULT_POINTS = [
  "NONE",
  "BEFORE_DISPATCH",
  "BEFORE_COMMIT",
  "AFTER_COMMIT_BEFORE_ACK",
  "AFTER_ACK",
] as const;
export type FaultPoint = (typeof FAULT_POINTS)[number];

export const FAULT_POINT_LABELS: Record<FaultPoint, string> = {
  NONE: "No fault (happy path)",
  BEFORE_DISPATCH: "Before dispatch",
  BEFORE_COMMIT: "Before commit",
  AFTER_COMMIT_BEFORE_ACK: "After commit, before ack",
  AFTER_ACK: "After ack",
};

/** Ordered event types emitted during a run. */
export const EVENT_TYPES = [
  "run.started",
  "agent.started",
  "tool.requested",
  "operation.created",
  "provider.dispatch",
  "provider.commit",
  "provider.ack",
  "fault.injected",
  "retry.started",
  "reconciliation.started",
  "reconciliation.found",
  "reconciliation.empty",
  "provider.redispatch",
  "tool.completed",
  "run.completed",
  "run.failed",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/**
 * A single ordered event. Correctness never depends on wall-clock time; the
 * monotonically increasing `sequence` is the only ordering signal.
 */
export interface RunEvent {
  sequence: number;
  type: EventType;
  attempt: number;
  operationId?: string;
  idempotencyKey?: string;
  effectId?: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export const INVARIANT_NAMES = [
  "NO_DUPLICATE_EFFECTS",
  "STABLE_OPERATION_ID",
  "BOUNDED_RETRIES",
  "SINGLE_TERMINAL_STATE",
  "RECONCILE_BEFORE_REPLAY",
] as const;
export type InvariantName = (typeof INVARIANT_NAMES)[number];

export interface Invariant {
  name: InvariantName;
  passed: boolean;
  explanation: string;
}

export type RunStatus = "completed" | "failed";

/** States of the safe operation state machine. */
export const OPERATION_STATES = [
  "CREATED",
  "DISPATCHING",
  "AMBIGUOUS",
  "CONFIRMED",
  "FAILED",
] as const;
export type OperationState = (typeof OPERATION_STATES)[number];

export interface RunResult {
  runId: string;
  strategy: Strategy;
  faultPoint: FaultPoint;
  seed: number;
  status: RunStatus;
  /** Number of times the provider was asked to dispatch the operation. */
  dispatchAttempts: number;
  /** Number of distinct committed side effects for the logical operation. */
  uniqueEffects: number;
  /** Terminal state of the operation state machine. */
  finalState: OperationState;
  events: RunEvent[];
  invariants: Invariant[];
  /** Human-readable verdict derived from NO_DUPLICATE_EFFECTS. */
  verdict: "SAFE" | "UNSAFE";
  model: {
    mode: "mock" | "gateway";
    modelId: string;
  };
}

export interface CompareResult {
  faultPoint: FaultPoint;
  seed: number;
  naive: RunResult;
  safe: RunResult;
}
