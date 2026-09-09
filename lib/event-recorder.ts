import type { EventType, RunEvent } from "./types";

/**
 * Collects ordered events for a single run.
 *
 * Ordering is expressed purely through a monotonically increasing `sequence`
 * counter, never wall-clock time, so traces are reproducible and comparable.
 */
export class EventRecorder {
  private events: RunEvent[] = [];
  private sequence = 0;

  record(
    type: EventType,
    message: string,
    fields: Omit<RunEvent, "sequence" | "type" | "message" | "attempt"> & {
      attempt?: number;
    } = {},
  ): RunEvent {
    const { attempt = 1, ...rest } = fields;
    const event: RunEvent = {
      sequence: this.sequence,
      type,
      attempt,
      message,
      ...rest,
    };
    this.sequence += 1;
    this.events.push(event);
    return event;
  }

  all(): RunEvent[] {
    return this.events;
  }
}
