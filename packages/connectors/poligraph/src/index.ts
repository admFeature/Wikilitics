/**
 * @app/connectors-poligraph — connecteur PoliGraph (Sénat + ministres).
 * Même interface SourceConnector que CIVIX.
 */
import type { SourceConnector } from "@app/connectors-base";
import { PoliGraphLiveConnector } from "./live.js";
import { PoliGraphDemoConnector } from "./demo.js";
import { POLIGRAPH_API } from "./routes.js";

export { PoliGraphLiveConnector } from "./live.js";
export { PoliGraphDemoConnector } from "./demo.js";
export { POLIGRAPH_API, POLIGRAPH_BASE, poligraphUrl } from "./routes.js";

export function isPoliGraphLiveEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.POLIGRAPH_LIVE === "1";
}

export function createPoliGraphConnector(
  env: NodeJS.ProcessEnv = process.env,
): SourceConnector {
  return isPoliGraphLiveEnabled(env)
    ? new PoliGraphLiveConnector()
    : new PoliGraphDemoConnector();
}

export function poligraphModeInfo(env: NodeJS.ProcessEnv = process.env): {
  live: boolean;
  base: string;
} {
  const live = isPoliGraphLiveEnabled(env);
  return { live, base: live ? POLIGRAPH_API : "démo (hors ligne)" };
}
