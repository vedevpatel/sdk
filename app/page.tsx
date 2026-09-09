"use client";

import { useCallback, useEffect, useState } from "react";
import { Comparison, RunPanel } from "@/components/comparison";
import { ScenarioControls } from "@/components/scenario-controls";
import type { FaultPoint, RunResult, Strategy } from "@/lib/types";

interface CompareView {
  mode: "compare";
  naive: RunResult;
  safe: RunResult;
}

interface SingleView {
  mode: "single";
  result: RunResult;
}

type View = CompareView | SingleView;

async function postRun(body: {
  strategy: Strategy;
  faultPoint: FaultPoint;
  seed: number;
}): Promise<RunResult> {
  const response = await fetch("/api/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.message ?? "Run failed.");
  }
  return payload as RunResult;
}

export default function Home() {
  const [strategy, setStrategy] = useState<Strategy>("naive");
  const [faultPoint, setFaultPoint] = useState<FaultPoint>(
    "AFTER_COMMIT_BEFORE_ACK",
  );
  const [seed, setSeed] = useState<number>(42);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View | null>(null);

  const runSingle = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await postRun({ strategy, faultPoint, seed });
      setView({ mode: "single", result });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Run failed.");
    } finally {
      setLoading(false);
    }
  }, [strategy, faultPoint, seed]);

  const runCompare = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [naive, safe] = await Promise.all([
        postRun({ strategy: "naive", faultPoint, seed }),
        postRun({ strategy: "safe", faultPoint, seed }),
      ]);
      setView({ mode: "compare", naive, safe });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Comparison failed.");
    } finally {
      setLoading(false);
    }
  }, [faultPoint, seed]);

  useEffect(() => {
    // Kick off the default landing comparison once on mount. Deferring to a
    // macrotask keeps the initial state update out of the effect's call stack.
    const id = setTimeout(() => void runCompare(), 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-10 sm:px-6 sm:py-14">
      <header className="flex flex-col gap-3 border-b border-[var(--color-ink)] pb-6">
        <h1 className="font-mono text-3xl font-bold tracking-tight sm:text-4xl">
          FAULTLINE
        </h1>
        <p className="text-lg font-medium">
          Break an agent between commit and acknowledgment.
        </p>
        <p className="text-[var(--color-muted)]">
          A failure-injection lab for durable agent tool calls.
        </p>
        <p className="max-w-2xl text-sm text-[var(--color-muted)]">
          Durability can replay work. Replaying a side-effecting tool blindly
          can duplicate the effect. Faultline injects a fault between the remote
          commit and its acknowledgment, then shows how naive retries and an
          idempotent, reconcile-first protocol diverge.
        </p>
      </header>

      <ScenarioControls
        strategy={strategy}
        faultPoint={faultPoint}
        seed={seed}
        loading={loading}
        onStrategyChange={setStrategy}
        onFaultPointChange={setFaultPoint}
        onSeedChange={setSeed}
        onRun={runSingle}
        onCompare={runCompare}
      />

      {error ? (
        <p
          role="alert"
          className="border border-[var(--color-fail)] px-4 py-3 font-mono text-[13px] text-[var(--color-fail)]"
        >
          {error}
        </p>
      ) : null}

      {loading && !view ? (
        <p className="font-mono text-[13px] text-[var(--color-muted)]">
          Running scenario…
        </p>
      ) : null}

      {view?.mode === "compare" ? (
        <Comparison naive={view.naive} safe={view.safe} />
      ) : null}

      {view?.mode === "single" ? (
        <div className="max-w-2xl">
          <RunPanel result={view.result} />
        </div>
      ) : null}

      <footer className="border-t border-[var(--color-line)] pt-6 text-sm text-[var(--color-muted)]">
        <p>
          The provider is simulated and deterministic. Faultline is a
          failure-semantics lab, not a payment system. It demonstrates the
          implemented recovery protocol; it does not claim any AI SDK defect.
        </p>
      </footer>
    </main>
  );
}
