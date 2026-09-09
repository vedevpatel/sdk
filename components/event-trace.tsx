import type { EventType, RunEvent } from "@/lib/types";

type Tone = "muted" | "commit" | "fault" | "retry" | "reconcile" | "ok" | "bad";

const EVENT_META: Record<EventType, { label: string; tone: Tone }> = {
  "run.started": { label: "RUN", tone: "muted" },
  "agent.started": { label: "AGENT", tone: "muted" },
  "tool.requested": { label: "TOOL →", tone: "muted" },
  "operation.created": { label: "OP", tone: "muted" },
  "provider.dispatch": { label: "DISPATCH", tone: "muted" },
  "provider.commit": { label: "COMMIT", tone: "commit" },
  "provider.ack": { label: "ACK", tone: "ok" },
  "fault.injected": { label: "FAULT", tone: "fault" },
  "retry.started": { label: "RETRY", tone: "retry" },
  "reconciliation.started": { label: "RECONCILE", tone: "reconcile" },
  "reconciliation.found": { label: "FOUND", tone: "reconcile" },
  "reconciliation.empty": { label: "EMPTY", tone: "reconcile" },
  "provider.redispatch": { label: "REDISPATCH", tone: "fault" },
  "tool.completed": { label: "TOOL ✓", tone: "ok" },
  "run.completed": { label: "DONE", tone: "ok" },
  "run.failed": { label: "FAILED", tone: "bad" },
};

const TONE_CLASS: Record<Tone, string> = {
  muted: "text-[var(--color-muted)] border-[var(--color-line)]",
  commit: "text-[var(--color-ink)] border-[var(--color-ink)] font-semibold",
  fault: "text-[var(--color-fail)] border-[var(--color-fail)] font-semibold",
  retry: "text-[var(--color-accent)] border-[var(--color-accent)]",
  reconcile: "text-[var(--color-accent)] border-[var(--color-accent)] font-semibold",
  ok: "text-[var(--color-pass)] border-[var(--color-pass)]",
  bad: "text-[var(--color-fail)] border-[var(--color-fail)] font-semibold",
};

function idBits(event: RunEvent): string {
  const parts: string[] = [];
  if (event.effectId) parts.push(event.effectId);
  else if (event.idempotencyKey) parts.push(`key=${event.idempotencyKey}`);
  return parts.join(" ");
}

export function EventTrace({ events }: { events: RunEvent[] }) {
  return (
    <ol className="font-mono text-[13px] leading-relaxed" aria-label="Event trace">
      {events.map((event) => {
        const meta = EVENT_META[event.type];
        return (
          <li
            key={event.sequence}
            className="grid grid-cols-[2.2rem_7rem_1fr] items-baseline gap-x-3 border-b border-dashed border-[var(--color-line)] py-1.5 last:border-b-0"
          >
            <span className="tabular-nums text-[var(--color-muted)]">
              {String(event.sequence).padStart(2, "0")}
            </span>
            <span
              className={`inline-block rounded-sm border px-1.5 py-0.5 text-[11px] tracking-wide ${TONE_CLASS[meta.tone]}`}
            >
              {meta.label}
            </span>
            <span className="min-w-0">
              <span className="text-[var(--color-ink)]">{event.message}</span>
              {idBits(event) ? (
                <span className="ml-2 text-[var(--color-muted)]">
                  {idBits(event)}
                </span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
