import { NextResponse } from "next/server";
import { z } from "zod";
import { runScenario } from "@/lib/runner";
import { runRequestSchema } from "@/lib/schema";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json", message: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = runRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_request",
        message: "Request failed validation.",
        issues: z.treeifyError(parsed.error),
      },
      { status: 400 },
    );
  }

  try {
    const result = await runScenario({
      strategy: parsed.data.strategy,
      faultPoint: parsed.data.faultPoint,
      seed: parsed.data.seed,
      modelMode: parsed.data.mode ?? "mock",
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return NextResponse.json(
      { error: "run_failed", message },
      { status: 500 },
    );
  }
}
