/**
 * Interface commune à tous les connecteurs de source (pattern « connecteur »).
 *
 * Chaque adaptateur (CIVIX en phase 1 ; PoliGraph, Légifrance… ensuite)
 * implémente cette interface et renvoie des objets NORMALISÉS du domaine,
 * chacun portant sa `Provenance`.
 */
import type {
  DeputeDetail,
  DeputeVote,
  Provenance,
  SearchHit,
  Source,
} from "@app/schema";

export interface SourceConnector {
  /** Identifiant de la source (sert aussi à la provenance). */
  readonly source: Source;

  /** Vrai si le connecteur tape une vraie API distante (LIVE), faux en démo. */
  readonly isLive: boolean;

  /** Recherche libre → résultats normalisés. */
  search(query: string): Promise<SearchHit[]>;

  /** Détail d'un·e député·e (avec provenance). 404 → null. */
  getDepute(uid: string): Promise<DeputeDetail | null>;

  /**
   * Derniers votes d'un·e député·e.
   * NB : reconstruits à partir des N derniers scrutins (pas de route directe).
   */
  getRecentVotesForDepute(uid: string, limit: number): Promise<DeputeVote[]>;
}

/** Construit un objet Provenance daté à l'instant de collecte. */
export function makeProvenance(
  source: Source,
  sourceUrl: string,
  licence: string,
): Provenance {
  return {
    source,
    sourceUrl,
    collectedAt: new Date().toISOString(),
    licence,
  };
}
