"use client";

import {
  FAULT_POINTS,
  FAULT_POINT_LABELS,
  type FaultPoint,
  type Strategy,
} from "@/lib/types";

interface ScenarioControlsProps {
  strategy: Strategy;
  faultPoint: FaultPoint;
  seed: number;
  loading: boolean;
  onStrategyChange: (strategy: Strategy) => void;
  onFaultPointChange: (faultPoint: FaultPoint) => void;
  onSeedChange: (seed: number) => void;
  onRun: () => void;
  onCompare: () => void;
}

const STRATEGY_OPTIONS: { value: Strategy; label: string }[] = [
  { value: "naive", label: "Naive Retry" },
  { value: "safe", label: "Idempotent + Reconcile" },
];

export function ScenarioControls({
  strategy,
  faultPoint,
  seed,
  loading,
  onStrategyChange,
  onFaultPointChange,
  onSeedChange,
  onRun,
  onCompare,
}: ScenarioControlsProps) {
  return (
    <section
      className="flex flex-col gap-5 border border-[var(--color-line)] p-4 sm:p-5"
      aria-label="Scenario controls"
    >
      <div className="flex flex-col gap-2">
        <span
          id="strategy-label"
          className="font-mono text-[11px] uppercase tracking-widest text-[var(--color-muted)]"
        >
          Strategy
        </span>
        <div
          className="inline-flex w-fit border border-[var(--color-ink)]"
          role="radiogroup"
          aria-labelledby="strategy-label"
        >
          {STRATEGY_OPTIONS.map((option, index) => {
            const active = option.value === strategy;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onStrategyChange(option.value)}
                className={`px-3 py-1.5 text-[13px] font-medium transition-colors ${
                  index > 0 ? "border-l border-[var(--color-ink)]" : ""
                } ${
                  active
                    ? "bg-[var(--color-ink)] text-[var(--color-paper)]"
                    : "bg-[var(--color-paper)] text-[var(--color-ink)] hover:bg-neutral-100"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-5">
        <label className="flex flex-col gap-2">
          <span className="font-mono text-[11px] uppercase tracking-widest text-[var(--color-muted)]">
            Fault point
          </span>
          <select
            value={faultPoint}
            onChange={(event) =>
              onFaultPointChange(event.target.value as FaultPoint)
            }
            className="border border-[var(--color-ink)] bg-[var(--color-paper)] px-2.5 py-1.5 font-mono text-[13px]"
          >
            {FAULT_POINTS.map((point) => (
              <option key={point} value={point}>
                {point} — {FAULT_POINT_LABELS[point]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-2">
          <span className="font-mono text-[11px] uppercase tracking-widest text-[var(--color-muted)]">
            Seed
          </span>
          <input
            type="number"
            min={0}
            value={seed}
            onChange={(event) => onSeedChange(Number(event.target.value))}
            className="w-24 border border-[var(--color-ink)] bg-[var(--color-paper)] px-2.5 py-1.5 font-mono text-[13px]"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onRun}
          disabled={loading}
          className="bg-[var(--color-ink)] px-4 py-2 text-[13px] font-semibold text-[var(--color-paper)] transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          Run Failure
        </button>
        <button
          type="button"
          onClick={onCompare}
          disabled={loading}
          className="border border-[var(--color-ink)] px-4 py-2 text-[13px] font-semibold text-[var(--color-ink)] transition-colors hover:bg-neutral-100 disabled:opacity-50"
        >
          Compare Both
        </button>
      </div>
    </section>
  );
}
