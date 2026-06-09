/**
 * Connecteur PoliGraph en mode LIVE — défensif (routes à confirmer via probe).
 *
 * Même contrat que CIVIX : recherche / fiche / derniers votes reconstruits
 * depuis les scrutins. Si la source n'expose pas de votes nominatifs, on
 * renvoie un état vide honnête (on n'invente jamais un vote).
 */
import {
  TtlCache,
  jsonFetch,
  makeProvenance,
  mapWithConcurrency,
  pick,
  isRecord,
  type Raw,
  type SourceConnector,
} from "@app/connectors-base";
import type { DeputeDetail, DeputeVote, SearchHit } from "@app/schema";
import { POLIGRAPH_LICENCE, poligraphUrl } from "./routes.js";
import {
  extractList,
  normPosition,
  normProfession,
  normScrutinSummary,
  normSearchHit,
  normSummary,
  normUid,
} from "./normalisation.js";

const VOTE_CONCURRENCY = 4;
const SCRUTIN_SCAN_WINDOW = 40;

export class PoliGraphLiveConnector implements SourceConnector {
  readonly source = "POLIGRAPH" as const;
  readonly isLive = true;
  private readonly cache = new TtlCache<unknown>(5 * 60_000);

  async search(query: string): Promise<SearchHit[]> {
    const payload = await this.cachedFetch(poligraphUrl.search(query));
    return extractList(payload).map(normSearchHit).filter((h) => h.uid !== "");
  }

  async getDepute(uid: string): Promise<DeputeDetail | null> {
    const url = poligraphUrl.personne(uid);
    let payload: unknown;
    try {
      payload = await this.cachedFetch(url);
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
    const raw = unwrap(payload);
    if (!raw) return null;
    const summary = normSummary(raw);
    if (summary.uid === "") return null;
    const profession = normProfession(raw);
    return {
      uid: summary.uid,
      nom: summary.nom,
      prenom: summary.prenom,
      ...(summary.groupe ? { groupe: summary.groupe } : {}),
      ...(summary.groupeAbbr ? { groupeAbbr: summary.groupeAbbr } : {}),
      ...(summary.circonscription ? { circonscription: summary.circonscription } : {}),
      ...(profession ? { profession } : {}),
      provenance: makeProvenance("POLIGRAPH", url, POLIGRAPH_LICENCE),
    };
  }

  async getRecentVotesForDepute(uid: string, limit: number): Promise<DeputeVote[]> {
    const scrutinsPayload = await this.cachedFetch(poligraphUrl.scrutins(SCRUTIN_SCAN_WINDOW));
    const scrutins = extractList(scrutinsPayload)
      .map(normScrutinSummary)
      .filter((s) => s.uid !== "");
    if (scrutins.length === 0) return [];

    const found = await mapWithConcurrency(
      scrutins,
      VOTE_CONCURRENCY,
      async (scrutin): Promise<DeputeVote | null> => {
        const votesUrl = poligraphUrl.scrutinVotes(scrutin.uid);
        const votesPayload = await this.cachedFetch(votesUrl);
        const position = extractPosition(extractList(votesPayload), uid);
        if (!position) return null;
        return {
          scrutin,
          position,
          provenance: makeProvenance("POLIGRAPH", votesUrl, POLIGRAPH_LICENCE),
        };
      },
    );
    return found.filter((v): v is DeputeVote => v !== null).slice(0, limit);
  }

  private cachedFetch(url: string): Promise<unknown> {
    return this.cache.getOrSet(url, () => jsonFetch(url));
  }
}

function extractPosition(rows: Raw[], uid: string): ReturnType<typeof normPosition> {
  for (const row of rows) {
    const directUid = pick(row, "uid", "id", "acteur_uid", "personne", "membre");
    if (directUid === uid) return normPosition(pick(row, "position", "vote", "sens"));
    const nested = row["personne"] ?? row["membre"] ?? row["acteur"];
    if (isRecord(nested) && normUid(nested) === uid) {
      return normPosition(pick(row, "position", "vote", "sens"));
    }
  }
  return undefined;
}

function unwrap(payload: unknown): Raw | undefined {
  if (isRecord(payload)) {
    for (const key of ["data", "result", "personne", "senateur", "membre"]) {
      const inner = payload[key];
      if (isRecord(inner)) return inner;
    }
    return payload;
  }
  return undefined;
}

function isNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    (err as { status?: number }).status === 404
  );
}
