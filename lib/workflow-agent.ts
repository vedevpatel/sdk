import { WorkflowAgent } from "@ai-sdk/workflow";
import { type LanguageModel, stepCountIs, tool } from "ai";
import { MockLanguageModelV4, simulateReadableStream } from "ai/test";
import { z } from "zod";

export interface RefundToolArgs {
  operationId: string;
  amount: number;
}

export interface RefundToolResult {
  status: "confirmed" | "failed";
  effectId?: string;
  dispatchAttempts: number;
  finalState: string;
}

export type ModelMode = "mock" | "gateway";

export interface ResolvedModel {
  model: LanguageModel;
  mode: ModelMode;
  modelId: string;
}

const USAGE = {
  inputTokens: { total: 24, noCache: 24, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 12, text: 12, reasoning: 0 },
} as const;

/**
 * Builds a deterministic LanguageModel that always drives the agent to call
 * `issueRefund` exactly once with the supplied arguments and then stops.
 *
 * This is the default model: it requires no API key, cannot burn tokens, and
 * makes the exact tool invocation reproducible so the failure lab is fully
 * deterministic.
 */
export function createDeterministicModel(args: RefundToolArgs): LanguageModel {
  return new MockLanguageModelV4({
    modelId: "faultline-mock",
    doStream: [
      {
        stream: simulateReadableStream({
          chunkDelayInMs: null,
          initialDelayInMs: null,
          chunks: [
            { type: "stream-start", warnings: [] },
            {
              type: "tool-input-start",
              id: "call_issue_refund",
              toolName: "issueRefund",
            },
            { type: "tool-input-end", id: "call_issue_refund" },
            {
              type: "tool-call",
              toolCallId: "call_issue_refund",
              toolName: "issueRefund",
              input: JSON.stringify(args),
            },
            {
              type: "finish",
              usage: USAGE,
              finishReason: { unified: "tool-calls", raw: "tool_calls" },
            },
          ],
        }),
      },
      {
        stream: simulateReadableStream({
          chunkDelayInMs: null,
          initialDelayInMs: null,
          chunks: [
            { type: "stream-start", warnings: [] },
            { type: "text-start", id: "final" },
            {
              type: "text-delta",
              id: "final",
              delta: "Refund resolved.",
            },
            { type: "text-end", id: "final" },
            {
              type: "finish",
              usage: USAGE,
              finishReason: { unified: "stop", raw: "stop" },
            },
          ],
        }),
      },
    ],
  });
}

/**
 * Resolves the model for a run. Defaults to the deterministic mock model. When
 * `mode` is `gateway` and `AI_GATEWAY_API_KEY` is present, a real model is used
 * via the Vercel AI Gateway (a `provider/model` string). The core demo never
 * depends on this path.
 */
export function resolveModel(
  mode: ModelMode,
  args: RefundToolArgs,
): ResolvedModel {
  if (mode === "gateway" && process.env.AI_GATEWAY_API_KEY) {
    const modelId = process.env.FAULTLINE_GATEWAY_MODEL ?? "openai/gpt-4o-mini";
    return { model: modelId, mode: "gateway", modelId };
  }
  return {
    model: createDeterministicModel(args),
    mode: "mock",
    modelId: "faultline-mock",
  };
}

/**
 * Creates the WorkflowAgent used to drive the refund. The agent has a single
 * conceptual tool, `issueRefund`, whose execution is delegated to the caller so
 * the strategy executor owns the durable failure semantics.
 */
export function createRefundAgent(params: {
  model: LanguageModel;
  onIssueRefund: (args: RefundToolArgs) => Promise<RefundToolResult>;
}): WorkflowAgent {
  return new WorkflowAgent({
    id: "faultline-refund-agent",
    model: params.model,
    instructions:
      "You are a payments operations agent. When asked to refund an operation, " +
      "call the issueRefund tool exactly once with the given operationId and amount. " +
      "Do not call it more than once.",
    tools: {
      issueRefund: tool({
        description:
          "Issue a refund for a logical operation. Idempotent by operationId.",
        inputSchema: z.object({
          operationId: z.string().describe("Stable id for the logical refund."),
          amount: z.number().describe("Refund amount in dollars."),
        }),
        execute: async (input) => params.onIssueRefund(input),
      }),
    },
    stopWhen: stepCountIs(4),
  });
}
