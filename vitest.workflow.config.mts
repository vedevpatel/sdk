import { defineConfig } from "vitest/config";
import { workflow } from "@workflow/vitest";

/**
 * Separate Vitest config for the runtime experiment only. It adds the
 * `@workflow/vitest` plugin, which SWC-compiles the `"use workflow"` /
 * `"use step"` directives, builds the runtime bundles, and runs an in-process
 * Local World. The deterministic lab's own suite (`vitest.config.mts`) is left
 * completely untouched.
 */
export default defineConfig({
  plugins: [workflow()],
  test: {
    include: ["workflows/**/*.integration.test.ts"],
    testTimeout: 60_000,
  },
});
