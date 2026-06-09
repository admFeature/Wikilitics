/**
 * @app/connectors-civix — connecteur de la source CIVIX (Assemblée nationale).
 *
 * Fabrique le connecteur selon le mode :
 *  - LIVE  si CIVIX_LIVE=1  → tape l'API réelle.
 *  - DÉMO  sinon (défaut)   → données fictives hors ligne.
 */
import { jsonFetch, type SourceConnector } from "@app/connectors-base";
import type { DeputeSummary } from "@app/schema";
import { CivixLiveConnector } from "./live.js";
import { CivixDemoConnector } from "./demo.js";
import { CIVIX_API } from "./routes.js";
import { fetchRoster } from "./roster.js";

export { CivixLiveConnector } from "./live.js";
export { CivixDemoConnector } from "./demo.js";
export { CIVIX_API, CIVIX_BASE, civixUrl } from "./routes.js";

/**
 * Vrai si le mode LIVE (vrais députés via l'API CIVIX) est actif.
 * LIVE par défaut désormais ; on force la démo hors ligne avec `DEMO=1`,
 * `CIVIX_DEMO=1` ou `CIVIX_LIVE=0`.
 */
export function isCivixLiveEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.DEMO === "1" || env.CIVIX_DEMO === "1" || env.CIVIX_LIVE === "0") {
    return false;
  }
  return true;
}

export function createCivixConnector(
  env: NodeJS.ProcessEnv = process.env,
): SourceConnector {
  return isCivixLiveEnabled(env)
    ? new CivixLiveConnector()
    : new CivixDemoConnector();
}

/** Récupère tout l'annuaire CIVIX (PA uid → nom/prénom), utile à l'ETL. */
export async function fetchAllCivixDeputes(): Promise<DeputeSummary[]> {
  const entries = await fetchRoster((url) => jsonFetch(url));
  return entries.map((e) => e.summary);
}

export function civixModeInfo(env: NodeJS.ProcessEnv = process.env): {
  live: boolean;
  base: string;
  note: string;
} {
  const live = isCivixLiveEnabled(env);
  return {
    live,
    base: live ? CIVIX_API : "démo (hors ligne)",
    note: live
      ? "Mode LIVE : recherche et fiche issues de l'API CIVIX (lecture seule). " +
        "CIVIX n'expose pas les votes nominatifs : la liste des votes peut être vide."
      : "Mode DÉMO : personnalités et votes FICTIFS, aucune donnée réelle.",
  };
}
