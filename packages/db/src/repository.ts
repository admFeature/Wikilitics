/**
 * Repository — traduit le modèle de domaine (@app/schema) ↔ Prisma.
 *
 * Sert de couche de persistance write-through : les faits récupérés via les
 * connecteurs (votes, scrutins) peuvent être stockés, et la personne est
 * rattachée à l'identifiant de sa source (`source_identity`) avec un score de
 * confiance (réconciliation).
 */
import type { PrismaClient } from "@prisma/client";
import type {
  DeputeSummary,
  DeputeVote,
  Provenance,
  Source,
  VotePosition,
} from "@app/schema";
import { getPrisma } from "./client.js";

export class Repository {
  constructor(private readonly prisma: PrismaClient = getPrisma()) {}

  /**
   * Rattache (ou crée) une personnalité à partir d'un identifiant de source.
   * Renvoie l'id interne `personnalite`. Le `confidence` reflète la fiabilité
   * du rapprochement (1.0 = identifiant direct de la source).
   */
  async resolvePersonnalite(
    source: Source,
    sourceUid: string,
    summary: Pick<DeputeSummary, "prenom" | "nom">,
    confidence = 1.0,
  ): Promise<string> {
    const existing = await this.prisma.sourceIdentity.findUnique({
      where: { source_sourceUid: { source, sourceUid } },
    });
    if (existing) return existing.personnaliteId;

    const personne = await this.prisma.personnalite.create({
      data: {
        prenom: summary.prenom,
        nom: summary.nom,
        identities: { create: { source, sourceUid, confidence } },
      },
    });
    return personne.id;
  }

  /**
   * Persiste un cluster d'identités (issu de la réconciliation) sous UNE seule
   * personnalité. Réutilise la personne si l'une des identités existe déjà.
   */
  async persistIdentityCluster(
    members: ReadonlyArray<{
      source: Source;
      sourceUid: string;
      prenom: string;
      nom: string;
      confidence: number;
    }>,
  ): Promise<string | null> {
    if (members.length === 0) return null;

    // Réutilise une personnalité existante si une identité est déjà connue.
    let personnaliteId: string | null = null;
    for (const m of members) {
      personnaliteId = await this.findPersonnaliteIdBySource(m.source, m.sourceUid);
      if (personnaliteId) break;
    }
    if (!personnaliteId) {
      const rep = members[0]!;
      const created = await this.prisma.personnalite.create({
        data: { prenom: rep.prenom, nom: rep.nom },
      });
      personnaliteId = created.id;
    }

    for (const m of members) {
      await this.prisma.sourceIdentity.upsert({
        where: { source_sourceUid: { source: m.source, sourceUid: m.sourceUid } },
        update: { confidence: m.confidence },
        create: {
          personnaliteId,
          source: m.source,
          sourceUid: m.sourceUid,
          confidence: m.confidence,
        },
      });
    }
    return personnaliteId;
  }

  /** Id interne d'une personne via son identifiant de source, ou null. */
  async findPersonnaliteIdBySource(
    source: Source,
    sourceUid: string,
  ): Promise<string | null> {
    const id = await this.prisma.sourceIdentity.findUnique({
      where: { source_sourceUid: { source, sourceUid } },
      select: { personnaliteId: true },
    });
    return id?.personnaliteId ?? null;
  }

  /** Upsert d'un scrutin (clé naturelle : source + sourceUid). */
  async upsertScrutin(
    source: Source,
    sourceUid: string,
    titre: string,
    date: string | undefined,
    resultat: string | undefined,
    prov: Provenance,
  ): Promise<string> {
    const data = {
      titre,
      date: date ? new Date(date) : null,
      resultat: resultat ?? null,
      sourceUrl: prov.sourceUrl,
      collectedAt: new Date(prov.collectedAt),
      licence: prov.licence,
    };
    const scrutin = await this.prisma.scrutin.upsert({
      where: { source_sourceUid: { source, sourceUid } },
      update: data,
      create: { source, sourceUid, ...data },
    });
    return scrutin.id;
  }

  /** Upsert d'un vote (clé naturelle : personne + scrutin). */
  async upsertVote(
    personnaliteId: string,
    scrutinId: string,
    position: VotePosition,
    prov: Provenance,
  ): Promise<void> {
    const data = {
      position,
      source: prov.source,
      sourceUrl: prov.sourceUrl,
      collectedAt: new Date(prov.collectedAt),
      licence: prov.licence,
    };
    await this.prisma.vote.upsert({
      where: { personnaliteId_scrutinId: { personnaliteId, scrutinId } },
      update: data,
      create: { personnaliteId, scrutinId, ...data },
    });
  }

  /** Persiste en une fois la personne, ses scrutins et ses votes. */
  async persistDeputeVotes(
    source: Source,
    sourceUid: string,
    summary: Pick<DeputeSummary, "prenom" | "nom">,
    votes: DeputeVote[],
  ): Promise<string> {
    const personnaliteId = await this.resolvePersonnalite(source, sourceUid, summary);
    for (const v of votes) {
      const scrutinId = await this.upsertScrutin(
        v.provenance.source,
        v.scrutin.uid,
        v.scrutin.titre,
        v.scrutin.date,
        v.scrutin.resultat,
        v.provenance,
      );
      await this.upsertVote(personnaliteId, scrutinId, v.position, v.provenance);
    }
    return personnaliteId;
  }

  /* ---------------------------------------------------------------- */
  /* ETL en masse (phase 3)                                           */
  /* ---------------------------------------------------------------- */

  /**
   * Résout en masse des personnalités par identifiant de source.
   * Crée les manquantes (personnalite + source_identity). Renvoie sourceUid→id.
   */
  async bulkResolvePersonnalites(
    source: Source,
    people: ReadonlyArray<{ sourceUid: string; prenom: string; nom: string }>,
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const uids = [...new Set(people.map((p) => p.sourceUid))];

    const existing = await this.prisma.sourceIdentity.findMany({
      where: { source, sourceUid: { in: uids } },
      select: { sourceUid: true, personnaliteId: true },
    });
    for (const e of existing) map.set(e.sourceUid, e.personnaliteId);

    const missing = people.filter((p) => !map.has(p.sourceUid));
    for (const p of missing) {
      if (map.has(p.sourceUid)) continue; // doublon dans l'entrée
      const created = await this.prisma.personnalite.create({
        data: {
          prenom: p.prenom,
          nom: p.nom,
          identities: { create: { source, sourceUid: p.sourceUid, confidence: 1.0 } },
        },
        select: { id: true },
      });
      map.set(p.sourceUid, created.id);
    }
    return map;
  }

  /** Upsert en masse de scrutins ; renvoie sourceUid→id. */
  async bulkUpsertScrutins(
    source: Source,
    scrutins: ReadonlyArray<{
      sourceUid: string;
      titre: string;
      date: string | undefined;
      resultat: string | undefined;
      prov: Provenance;
    }>,
  ): Promise<Map<string, string>> {
    for (const s of scrutins) {
      await this.upsertScrutin(source, s.sourceUid, s.titre, s.date, s.resultat, s.prov);
    }
    const rows = await this.prisma.scrutin.findMany({
      where: { source, sourceUid: { in: scrutins.map((s) => s.sourceUid) } },
      select: { id: true, sourceUid: true },
    });
    return new Map(rows.map((r) => [r.sourceUid, r.id]));
  }

  /** Insère des votes en masse (ignore les doublons), par lots. */
  async bulkInsertVotes(
    rows: ReadonlyArray<{
      personnaliteId: string;
      scrutinId: string;
      position: VotePosition;
      prov: Provenance;
    }>,
    chunkSize = 5000,
  ): Promise<number> {
    let inserted = 0;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const res = await this.prisma.vote.createMany({
        data: chunk.map((r) => ({
          personnaliteId: r.personnaliteId,
          scrutinId: r.scrutinId,
          position: r.position,
          source: r.prov.source,
          sourceUrl: r.prov.sourceUrl,
          collectedAt: new Date(r.prov.collectedAt),
          licence: r.prov.licence,
        })),
        skipDuplicates: true,
      });
      inserted += res.count;
    }
    return inserted;
  }

  /**
   * Derniers votes d'une personne identifiée par un uid de source QUELCONQUE
   * (les sources Assemblée/CIVIX partagent l'uid acteur « PA… »).
   */
  async listVotesByActeurRef(uid: string, limit: number): Promise<DeputeVote[]> {
    const ident = await this.prisma.sourceIdentity.findFirst({
      where: { sourceUid: uid },
      select: { personnaliteId: true },
    });
    if (!ident) return [];
    return this.listRecentVotes(ident.personnaliteId, limit);
  }

  /** Lit les derniers votes persistés d'une personne, au format domaine. */
  async listRecentVotes(personnaliteId: string, limit: number): Promise<DeputeVote[]> {
    const rows = await this.prisma.vote.findMany({
      where: { personnaliteId },
      include: { scrutin: true },
      orderBy: [{ scrutin: { date: "desc" } }],
      take: limit,
    });
    return rows.map((row) => ({
      scrutin: {
        uid: row.scrutin.sourceUid,
        titre: row.scrutin.titre,
        ...(row.scrutin.date ? { date: row.scrutin.date.toISOString().slice(0, 10) } : {}),
        ...(row.scrutin.resultat ? { resultat: row.scrutin.resultat } : {}),
      },
      position: row.position as VotePosition,
      provenance: {
        source: row.source as Source,
        sourceUrl: row.sourceUrl,
        collectedAt: row.collectedAt.toISOString(),
        licence: row.licence,
      },
    }));
  }
}
