import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDeterministicModel,
  createRefundAgent,
  resolveModel,
  type RefundToolArgs,
} from "../lib/workflow-agent";

describe("workflow-agent", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("drives a real WorkflowAgent to call issueRefund exactly once", async () => {
    const calls: RefundToolArgs[] = [];
    const agent = createRefundAgent({
      model: createDeterministicModel({ operationId: "op_42", amount: 42 }),
      onIssueRefund: async (args) => {
        calls.push(args);
        return {
          status: "confirmed",
          effectId: "effect_test",
          dispatchAttempts: 1,
          finalState: "CONFIRMED",
        };
      },
    });

    const result = await agent.stream({
      prompt: "Refund operation op_42 for $42.",
    });

    expect(calls).toEqual([{ operationId: "op_42", amount: 42 }]);
    expect(result.finishReason).toBe("stop");
    expect(result.steps.length).toBeGreaterThanOrEqual(1);
  });

  it("defaults to the deterministic mock model", () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    const resolved = resolveModel("gateway", { operationId: "op_1", amount: 42 });
    expect(resolved.mode).toBe("mock");
    expect(resolved.modelId).toBe("faultline-mock");
  });

  it("uses the gateway model only when a key is present and requested", () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
    const resolved = resolveModel("gateway", { operationId: "op_1", amount: 42 });
    expect(resolved.mode).toBe("gateway");
    expect(typeof resolved.model).toBe("string");

    const mockDefault = resolveModel("mock", { operationId: "op_1", amount: 42 });
    expect(mockDefault.mode).toBe("mock");
  });
});
