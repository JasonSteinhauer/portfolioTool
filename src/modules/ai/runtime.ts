import "server-only";
import { parseAiConfig, type AiConfig } from "./config";
import { createProvider, type AiProvider } from "./provider";

let cached: { config: AiConfig; provider: AiProvider | null } | undefined;

/** KI-Konfiguration und Provider der laufenden App (lazy, nur serverseitig). */
export function aiRuntime() {
  cached ??= (() => {
    const config = parseAiConfig(process.env);
    return { config, provider: createProvider(config) };
  })();
  return cached;
}
