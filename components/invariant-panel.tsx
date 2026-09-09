import type { Invariant } from "@/lib/types";

export function InvariantPanel({ invariants }: { invariants: Invariant[] }) {
  return (
    <ul className="flex flex-col gap-2" aria-label="Invariants">
      {invariants.map((invariant) => (
        <li
          key={invariant.name}
          className="border border-[var(--color-line)] p-3"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[13px] font-semibold">
              {invariant.name}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 font-mono text-[12px] font-semibold ${
                invariant.passed
                  ? "text-[var(--color-pass)]"
                  : "text-[var(--color-fail)]"
              }`}
            >
              <span aria-hidden>{invariant.passed ? "●" : "✕"}</span>
              {invariant.passed ? "PASS" : "FAIL"}
            </span>
          </div>
          <p className="mt-1 text-[13px] text-[var(--color-muted)]">
            {invariant.explanation}
          </p>
        </li>
      ))}
    </ul>
  );
}
