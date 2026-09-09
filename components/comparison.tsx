import type { RunResult, Strategy } from "@/lib/types";
import { EventTrace } from "./event-trace";
import { InvariantPanel } from "./invariant-panel";

const STRATEGY_TITLE: Record<Strategy, string> = {
  naive: "Naive Retry",
  safe: "Idempotent + Reconcile",
};

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col">
      <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--color-muted)]">
        {label}
      </span>
      <span className="font-mono text-[15px] font-semibold tabular-nums">
        {value}
      </span>
    </div>
  );
}

export function RunPanel({ result }: { result: RunResult }) {
  const safe = result.verdict === "SAFE";
  return (
    <article className="flex flex-col border border-[var(--color-line)]">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--color-line)] bg-neutral-50 px-4 py-3">
        <div>
          <h3 className="text-[15px] font-semibold">
            {STRATEGY_TITLE[result.strategy]}
          </h3>
          <p className="font-mono text-[11px] text-[var(--color-muted)]">
            {result.faultPoint} · seed {result.seed} · {result.model.modelId}
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-2 border px-2.5 py-1 font-mono text-[12px] font-bold ${
            safe
              ? "border-[var(--color-pass)] text-[var(--color-pass)]"
              : "border-[var(--color-fail)] text-[var(--color-fail)]"
          }`}
        >
          {safe ? "SAFE" : "UNSAFE"}
        </span>
      </header>

      <div className="grid grid-cols-3 gap-3 border-b border-[var(--color-line)] px-4 py-3">
        <Stat label="Dispatches" value={result.dispatchAttempts} />
        <Stat label="Unique effects" value={result.uniqueEffects} />
        <Stat label="Final state" value={result.finalState} />
      </div>

      <div className="flex flex-col gap-4 p-4">
        <div>
          <h4 className="mb-2 font-mono text-[11px] uppercase tracking-widest text-[var(--color-muted)]">
            Event trace
          </h4>
          <EventTrace events={result.events} />
        </div>
        <div>
          <h4 className="mb-2 font-mono text-[11px] uppercase tracking-widest text-[var(--color-muted)]">
            Invariants
          </h4>
          <InvariantPanel invariants={result.invariants} />
        </div>
      </div>
    </article>
  );
}

export function Comparison({
  naive,
  safe,
}: {
  naive: RunResult;
  safe: RunResult;
}) {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <RunPanel result={naive} />
      <RunPanel result={safe} />
    </div>
  );
}
