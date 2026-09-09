import { z } from "zod";
import { FAULT_POINTS, STRATEGIES } from "./types";

export const runRequestSchema = z.object({
  strategy: z.enum(STRATEGIES),
  faultPoint: z.enum(FAULT_POINTS),
  seed: z
    .number()
    .int("seed must be an integer")
    .min(0, "seed must be non-negative")
    .max(2 ** 31 - 1, "seed is too large"),
  mode: z.enum(["mock", "gateway"]).optional(),
});

export type RunRequest = z.infer<typeof runRequestSchema>;
