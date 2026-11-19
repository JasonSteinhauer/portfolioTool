import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const alias = {
  "@": fileURLToPath(new URL("./src", import.meta.url)),
  // `server-only` wirft außerhalb von React Server Components – in Tests neutralisieren.
  "server-only": fileURLToPath(new URL("./tests/support/empty.ts", import.meta.url)),
};

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          globalSetup: ["tests/support/integration-global-setup.ts"],
          // Alle Integrationstests teilen sich eine Wegwerf-DB → seriell ausführen.
          fileParallelism: false,
          testTimeout: 20_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
