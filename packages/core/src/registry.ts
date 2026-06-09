/**
 * Registre multi-connecteurs + orchestration (partagé Fastify ET Next).
 *
 * - Agrège la recherche sur TOUTES les sources (CIVIX = Assemblée,
 *   PoliGraph = Sénat/ministres), même interface `SourceConnector`.
 * - Encode la source dans l'uid exposé au frontend (`SOURCE:uid`) pour router
 *   ensuite le détail et les votes vers le bon connecteur.
 * - Réconcilie les identités entre sources (score de confiance) et annote les
 *   résultats vus dans plusieurs sources.
 * - Votes nominatifs : index Assemblée en mémoire (open data) → base (si ETL) →
 *   connecteur.
 */
import type { SourceConnector } from "@app/connectors-base";
import type { DeputeDetail, DeputeVote, SearchHit, Source } from "@app/schema";
import { createCivixConnector } from "@app/connectors-civix";
import { createPoliGraphConnector } from "@app/connectors-poligraph";
import { AssembleeVotesIndex } from "@app/connectors-assemblee";
import { reconcile, type IdentityCandidate } from "@app/reconciliation";
// IMPORTANT : @app/db (et donc @prisma/client) n'est JAMAIS importé
// statiquement. Sans DATABASE_URL, la persistance est désactivée et Prisma
// n'a même pas besoin d'être généré (chargement paresseux par import()).
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
    // On ne MÉLANGE JAMAIS des sources réelles (live) avec des sources de démo.
    this.liveMode = candidates.some((c) => c.isLive);
    const kept = this.liveMode ? candidates.filter((c) => c.isLive) : candidates;
    this.connectors = new Map<Source, SourceConnector>(kept.map((c) => [c.source, c]));
    this.dbEnabled =
      typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL.trim() !== "";
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
      return null; // Prisma non généré / base injoignable : on dégrade.
    }
  }

  /** Renvoie l'objet { live, base, note, persistence } selon les sources ACTIVES. */
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

    const repo = await this.getRepo();
    if (repo) {
      await Promise.all(
        clusters.map((c) =>
          repo
            .persistIdentityCluster(
              c.members.map((m) => ({
                source: m.source,
                sourceUid: m.sourceUid,
                prenom: m.prenom,
                nom: m.nom,
                confidence: m.confidence,
              })),
            )
            .catch(() => null),
        ),
      );
    }

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
      const annotation = otherSources.length > 0 ? ` · aussi dans ${otherSources.join(", ")}` : "";
      const sub = hit.sublabel ?? source;
      return { ...hit, uid: prefixedUid, sublabel: `${sub}${annotation}` };
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
    return { ...detail, uid: prefixedUid };
  }

  /** Votes : mémoire (Assemblée open data) → base (si ETL) → connecteur. */
  async getVotes(prefixedUid: string, limit: number): Promise<DeputeVote[]> {
    const decoded = decodeUid(prefixedUid);
    if (!decoded) return [];

    if (this.liveMode) {
      try {
        await this.assemblee.load();
        const anVotes = this.assemblee.getVotes(decoded.uid, limit);
        if (anVotes.length > 0) return anVotes;
      } catch {
        /* index indisponible : on tente les autres sources */
      }
    }

    const repo = await this.getRepo();
    if (repo) {
      const dbVotes = await repo.listVotesByActeurRef(decoded.uid, limit).catch(() => []);
      if (dbVotes.length > 0) return dbVotes;
    }

    const connector = this.connectors.get(decoded.source);
    if (!connector) return [];
    return connector.getRecentVotesForDepute(decoded.uid, limit);
  }
}

/** Singleton paresseux — pratique en serverless (réutilisé entre invocations chaudes). */
let singleton: ConnectorRegistry | undefined;
export function getRegistry(): ConnectorRegistry {
  if (!singleton) singleton = new ConnectorRegistry();
  return singleton;
}
