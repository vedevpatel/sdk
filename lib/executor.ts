import type { EventRecorder } from "./event-recorder";
import type { FaultInjector } from "./fault-injector";
import type { SimulatedProvider } from "./simulated-provider";
import type { OperationState, Strategy } from "./types";

/** Default upper bound on dispatch attempts for a single logical operation. */
export const MAX_ATTEMPTS = 3;

export interface ExecutorContext {
  operationId: string;
  amount: number;
  provider: SimulatedProvider;
  faults: FaultInjector;
  recorder: EventRecorder;
  maxAttempts?: number;
}

export interface ExecutorOutcome {
  finalState: OperationState;
  dispatchAttempts: number;
  confirmedEffectId?: string;
}

export interface Executor {
  readonly strategy: Strategy;
  execute(ctx: ExecutorContext): ExecutorOutcome;
}
