/**
 * Registre multi-connecteurs + orchestration (phase 2).
 *
 * - Agrège la recherche sur TOUTES les sources (CIVIX = Assemblée,
 *   PoliGraph = Sénat/ministres), même interface `SourceConnector`.
 * - Encode la source dans l'uid exposé au frontend (`SOURCE:uid`) pour router
 *   ensuite le détail et les votes vers le bon connecteur.
 * - Réconcilie les identités entre sources (score de confiance) et annote les
 *   résultats vus dans plusieurs sources.
 * - Persiste (optionnellement, si une base est configurée) les clusters
 *   d'identité et les votes récupérés.
 */
import type { SourceConnector } from "@app/connectors-base";
import type {
  DeputeDetail,
  DeputeVote,
  SearchHit,
  Source,
} from "@app/schema";
import { createCivixConnector } from "@app/connectors-civix";
import { createPoliGraphConnector } from "@app/connectors-poligraph";
import { AssembleeVotesIndex } from "@app/connectors-assemblee";
import { reconcile, type IdentityCandidate } from "@app/reconciliation";
// IMPORTANT : @app/db (et donc @prisma/client) n'est JAMAIS importé
// statiquement. Sans DATABASE_URL, la persistance est désactivée et Prisma
// n'a même pas besoin d'être généré. Le chargement est paresseux (dynamic
// import) et ne se produit que si une base est réellement configurée.
import type { Repository } from "@app/db";

/** Sépare un prénom composé (1er mot) du nom (reste) — approximation. */
function splitLabel(label: string): { prenom: string; nom: string } {
  const parts = label.trim().split(/\s+/);
  if (parts.length <= 1) return { prenom: "", nom: label.trim() };
  return { prenom: parts[0]!, nom: parts.slice(1).join(" ") };
}

/** Libellé lisible d'une source pour l'affichage. */
function sourceLabel(source: Source): string {
  if (source === "CIVIX") return "CIVIX (Assemblée)";
  if (source === "POLIGRAPH") return "PoliGraph (Sénat/ministres)";
  return source;
}

const SEP = ":";
export function encodeUid(source: Source, uid: string): string {
  return `${source}${SEP}${uid}`;
}
export function decodeUid(prefixed: string): { source: Source; uid: string } | null {
  const idx = prefixed.indexOf(SEP);
  if (idx === -1) return null;
  return {
    source: prefixed.slice(0, idx) as Source,
    uid: prefixed.slice(idx + 1),
  };
}

export class ConnectorRegistry {
  private readonly connectors: Map<Source, SourceConnector>;
  private readonly dbEnabled: boolean;
  private readonly liveMode: boolean;
  private repoPromise: Promise<Repository> | null = null;
  /** Votes nominatifs Assemblée en mémoire (open data) — utilisés en mode live. */
  private readonly assemblee = new AssembleeVotesIndex();

  constructor() {
    const candidates = [createCivixConnector(), createPoliGraphConnector()];
    // On ne MÉLANGE JAMAIS des sources réelles (live) avec des sources de démo
    // (fictives) : si au moins une source est live, on ne garde que les live.
    this.liveMode = candidates.some((c) => c.isLive);
    const kept = this.liveMode ? candidates.filter((c) => c.isLive) : candidates;
    this.connectors = new Map<Source, SourceConnector>(
      kept.map((c) => [c.source, c]),
    );
    this.dbEnabled = typeof process.env.DATABASE_URL === "string"
      && process.env.DATABASE_URL.trim() !== "";
  }

  /** Préchauffe l'index des votes Assemblée (à appeler au démarrage si live). */
  async warmAssemblee(): Promise<void> {
    if (this.liveMode) await this.assemblee.load().catch(() => undefined);
  }

  get persistenceEnabled(): boolean {
    return this.dbEnabled;
  }

  /** Charge le repository à la première demande (et seulement si DB configurée). */
  private async getRepo(): Promise<Repository | null> {
    if (!this.dbEnabled) return null;
    if (!this.repoPromise) {
      this.repoPromise = import("@app/db").then((m) => new m.Repository());
    }
    try {
      return await this.repoPromise;
    } catch {
      // Si Prisma n'est pas généré / base injoignable : on dégrade sans casser.
      return null;
    }
  }

  /** Renvoie l'objet { live, base, note } (forme About) selon les sources ACTIVES. */
  about() {
    const active = [...this.connectors.values()];
    const live = active.some((c) => c.isLive);
    const base = active
      .map((c) => `${sourceLabel(c.source)} ${c.isLive ? "live" : "démo"}`)
      .join(" · ");
    const note = live
      ? `Données réelles via ${base}. ` +
        `Note : CIVIX n'expose pas les votes nominatifs (la liste de votes peut être vide).`
      : `Mode DÉMO, données FICTIVES (${base}). Aucune donnée réelle.`;
    const persist = this.dbEnabled ? " Persistance Postgres active." : "";
    return { live, base, note: note + persist, persistence: this.dbEnabled };
  }

  /** Recherche agrégée + réconciliation inter-sources. */
  async search(query: string): Promise<SearchHit[]> {
    const perSource = await Promise.all(
      [...this.connectors.entries()].map(async ([source, connector]) => {
        const hits = await connector.search(query).catch(() => [] as SearchHit[]);
        return hits.map((h) => ({ source, hit: h }));
      }),
    );
    const flat = perSource.flat();

    // Réconciliation : candidats à partir des libellés.
    const candidates: IdentityCandidate[] = flat.map(({ source, hit }) => {
      const { prenom, nom } = splitLabel(hit.label);
      return {
        source,
        sourceUid: hit.uid,
        prenom,
        nom,
        ...(hit.sublabel ? { circonscription: hit.sublabel } : {}),
      };
    });
    const clusters = reconcile(candidates);

    // Persistance optionnelle des clusters (mapping + confiance).
    const repo = await this.getRepo();
    if (repo) {
      await Promise.all(
        clusters.map((c) =>
          repo.persistIdentityCluster(
            c.members.map((m) => ({
              source: m.source,
              sourceUid: m.sourceUid,
              prenom: m.prenom,
              nom: m.nom,
              confidence: m.confidence,
            })),
          ).catch(() => null),
        ),
      );
    }

    // Annoter les hits présents dans plusieurs sources.
    const multiSourceUids = new Map<string, Source[]>();
    for (const c of clusters) {
      const sources = [...new Set(c.members.map((m) => m.source))];
      if (sources.length > 1) {
        for (const m of c.members) multiSourceUids.set(m.sourceUid, sources);
      }
    }

    return flat.map(({ source, hit }) => {
      const prefixedUid = encodeUid(source, hit.uid);
      const otherSources = (multiSourceUids.get(hit.uid) ?? []).filter((s) => s !== source);
      const annotation =
        otherSources.length > 0 ? ` · aussi dans ${otherSources.join(", ")}` : "";
      const base = hit.sublabel ?? source;
      return { ...hit, uid: prefixedUid, sublabel: `${base}${annotation}` };
    });
  }

  /** Détail routé vers le bon connecteur (uid préfixé par la source). */
  async getDepute(prefixedUid: string): Promise<DeputeDetail | null> {
    const decoded = decodeUid(prefixedUid);
    if (!decoded) return null;
    const connector = this.connectors.get(decoded.source);
    if (!connector) return null;
    const detail = await connector.getDepute(decoded.uid);
    if (!detail) return null;
    // On ré-expose l'uid préfixé pour rester cohérent côté frontend.
    return { ...detail, uid: prefixedUid };
  }

  /**
   * Votes d'une personne. Priorité aux votes NOMINATIFS persistés (ETL Assemblée,
   * phase 3), joints par `acteurRef` (= uid CIVIX). À défaut, on interroge le
   * connecteur (live ; vide pour CIVIX qui n'expose pas le nominatif).
   */
  async getVotes(prefixedUid: string, limit: number): Promise<DeputeVote[]> {
    const decoded = decodeUid(prefixedUid);
    if (!decoded) return [];

    // 1) Votes nominatifs Assemblée EN MÉMOIRE (open data) — aucune base requise.
    //    L'uid CIVIX (« PA… ») est le même acteurRef que dans l'open data AN.
    if (this.liveMode) {
      try {
        await this.assemblee.load();
        const anVotes = this.assemblee.getVotes(decoded.uid, limit);
        if (anVotes.length > 0) return anVotes;
      } catch {
        /* index indisponible : on tente les autres sources */
      }
    }

    // 2) Votes nominatifs persistés en base (si une DB est configurée + ETL).
    const repo = await this.getRepo();
    if (repo) {
      const dbVotes = await repo.listVotesByActeurRef(decoded.uid, limit).catch(() => []);
      if (dbVotes.length > 0) return dbVotes;
    }

    // 3) Repli connecteur (live ; vide pour CIVIX qui n'expose pas le nominatif).
    const connector = this.connectors.get(decoded.source);
    if (!connector) return [];
    return connector.getRecentVotesForDepute(decoded.uid, limit);
  }
}
