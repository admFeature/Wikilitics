/**
 * Connecteur CIVIX en mode LIVE — interroge l'API réelle à la demande,
 * avec cache TTL et concurrence bornée. Implémente SourceConnector.
 *
 * Recherche et fiche fonctionnent en live. Pour les votes, voir la note sur
 * l'absence de votes nominatifs côté CIVIX dans `normalisation.ts`.
 */
import {
  TtlCache,
  jsonFetch,
  makeProvenance,
  mapWithConcurrency,
  type SourceConnector,
} from "@app/connectors-base";
import type { DeputeDetail, DeputeVote, SearchHit } from "@app/schema";
import { CIVIX_LICENCE, civixUrl } from "./routes.js";
import {
  extractDeputeDetail,
  extractDeputesFromSearch,
  extractNominativeVotes,
  extractPositionForDepute,
  extractScrutinsList,
  normDeputeSummary,
  normProfession,
  normScrutinSummary,
  normSearchHit,
} from "./normalisation.js";
import { fetchRoster, filterRoster, type RosterEntry } from "./roster.js";

/** Nb d'appels parallèles vers CIVIX (« usage raisonnable »). */
const VOTE_CONCURRENCY = 4;
/** Nb de scrutins récents balayés pour reconstruire les votes d'une personne. */
const SCRUTIN_SCAN_WINDOW = 40;

export class CivixLiveConnector implements SourceConnector {
  readonly source = "CIVIX" as const;
  readonly isLive = true;

  private readonly cache = new TtlCache<unknown>(5 * 60_000);
  /** Annuaire préchargé (chargé une seule fois), pour suggestions instantanées. */
  private rosterPromise: Promise<RosterEntry[]> | null = null;

  async search(query: string): Promise<SearchHit[]> {
    // 1) Suggestions instantanées via l'annuaire préchargé.
    try {
      const roster = await this.getRoster();
      if (roster.length > 0) return filterRoster(roster, query);
    } catch {
      // Annuaire indisponible : on retombe sur l'endpoint /search.
    }
    // 2) Repli : endpoint /search de CIVIX.
    const payload = await this.cachedFetch(civixUrl.search(query));
    return extractDeputesFromSearch(payload)
      .map(normSearchHit)
      .filter((h) => h.uid !== "");
  }

  /** Charge l'annuaire complet une seule fois (mémoïsé). */
  private getRoster(): Promise<RosterEntry[]> {
    if (!this.rosterPromise) {
      this.rosterPromise = fetchRoster((url) => this.cachedFetch(url));
    }
    return this.rosterPromise;
  }

  async getDepute(uid: string): Promise<DeputeDetail | null> {
    const url = civixUrl.depute(uid);
    let payload: unknown;
    try {
      payload = await this.cachedFetch(url);
    } catch (err) {
      if (isNotFound(err)) return null; // 404 → personne absente.
      throw err;
    }
    const raw = extractDeputeDetail(payload);
    if (!raw) return null;

    const summary = normDeputeSummary(raw);
    if (summary.uid === "") return null;

    const profession = normProfession(raw);
    return {
      ...summary,
      ...(profession ? { profession } : {}),
      provenance: makeProvenance("CIVIX", url, CIVIX_LICENCE),
    };
  }

  async getRecentVotesForDepute(uid: string, limit: number): Promise<DeputeVote[]> {
    // 1) Récupère les N derniers scrutins (il n'existe pas de route par député).
    const scrutinsPayload = await this.cachedFetch(civixUrl.scrutins(SCRUTIN_SCAN_WINDOW));
    const scrutins = extractScrutinsList(scrutinsPayload)
      .map(normScrutinSummary)
      .filter((s) => s.uid !== "");
    if (scrutins.length === 0) return [];

    // 2) Sonde le 1er scrutin : CIVIX expose-t-il des votes NOMINATIFS ?
    //    Sinon, on s'arrête là — on n'invente pas de vote depuis un agrégat.
    const firstUrl = civixUrl.scrutinVotes(scrutins[0]!.uid);
    const firstPayload = await this.cachedFetch(firstUrl);
    if (extractNominativeVotes(firstPayload).length === 0) {
      return []; // état vide honnête (voir note dans normalisation.ts)
    }

    // 3) Cas où le nominatif existe : extraction concurrente bornée.
    const found = await mapWithConcurrency(
      scrutins,
      VOTE_CONCURRENCY,
      async (scrutin): Promise<DeputeVote | null> => {
        const votesUrl = civixUrl.scrutinVotes(scrutin.uid);
        const votesPayload = await this.cachedFetch(votesUrl);
        const position = extractPositionForDepute(
          extractNominativeVotes(votesPayload),
          uid,
        );
        if (!position) return null;
        return {
          scrutin,
          position,
          provenance: makeProvenance("CIVIX", votesUrl, CIVIX_LICENCE),
        };
      },
    );

    return found.filter((v): v is DeputeVote => v !== null).slice(0, limit);
  }

  private cachedFetch(url: string): Promise<unknown> {
    return this.cache.getOrSet(url, () => jsonFetch(url));
  }
}

/** Détecte une UpstreamError de statut 404. */
function isNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    (err as { status?: number }).status === 404
  );
}
