/**
 * Connecteur PoliGraph en mode DÉMO — hors ligne (Sénat + ministres).
 *
 * ANTI-DÉSINFORMATION : toutes les personnalités et tous les votes sont FICTIFS.
 * Couvre des profils sénateur·rice et ministre pour démontrer l'agrégation
 * multi-sources (CIVIX = Assemblée, PoliGraph = Sénat/ministres).
 */
import { makeProvenance, type SourceConnector } from "@app/connectors-base";
import type {
  DeputeDetail,
  DeputeVote,
  SearchHit,
  VotePosition,
} from "@app/schema";

const DEMO_LICENCE = "Données fictives de démonstration";
const DEMO_BASE = "https://exemple.invalid/poligraph";

interface DemoPersonne {
  detail: Omit<DeputeDetail, "provenance">;
  role: string;
  votes: Array<{ uid: string; date: string; titre: string; resultat: string; position: VotePosition }>;
}

const DEMO_DATA: Record<string, DemoPersonne> = {
  "pg-sen-01": {
    role: "Sénatrice",
    detail: {
      uid: "pg-sen-01",
      prenom: "Camille",
      nom: "Durand-Fictif", // homonyme volontaire du député CIVIX → réconciliation
      groupe: "Groupe Sénatorial de Démonstration",
      groupeAbbr: "GSD",
      circonscription: "Exemplie (Sénat)",
      profession: "Sénatrice (personnage fictif)",
    },
    votes: [
      { uid: "sen-2001", date: "2026-05-20", titre: "Proposition de loi fictive sur l'eau", resultat: "adopté", position: "pour" },
      { uid: "sen-2002", date: "2026-05-12", titre: "Amendement fictif au budget de la culture", resultat: "rejeté", position: "abstention" },
    ],
  },
  "pg-sen-02": {
    role: "Sénateur",
    detail: {
      uid: "pg-sen-02",
      prenom: "Hugo",
      nom: "Lefevre-Exemple",
      groupe: "Groupe des Territoires Imaginaires",
      groupeAbbr: "GTI",
      circonscription: "Fictiville (Sénat)",
      profession: "Sénateur (personnage fictif)",
    },
    votes: [
      { uid: "sen-2001", date: "2026-05-20", titre: "Proposition de loi fictive sur l'eau", resultat: "adopté", position: "contre" },
      { uid: "sen-2003", date: "2026-04-30", titre: "Résolution fictive sur la ruralité", resultat: "adopté", position: "pour" },
    ],
  },
  "pg-min-01": {
    role: "Ministre fictive",
    detail: {
      uid: "pg-min-01",
      prenom: "Inès",
      nom: "Bernard-Imaginaire",
      groupe: "Gouvernement (démonstration)",
      groupeAbbr: "GOUV",
      circonscription: "Ministère de l'Exemple",
      profession: "Ministre (personnage fictif)",
    },
    votes: [], // un·e ministre n'a pas de votes parlementaires ici
  },
};

export class PoliGraphDemoConnector implements SourceConnector {
  readonly source = "POLIGRAPH" as const;
  readonly isLive = false;

  async search(query: string): Promise<SearchHit[]> {
    const q = query.trim().toLowerCase();
    const all = Object.values(DEMO_DATA);
    const matches = q === ""
      ? all
      : all.filter(({ detail }) =>
          `${detail.prenom} ${detail.nom} ${detail.groupeAbbr ?? ""}`.toLowerCase().includes(q),
        );
    return matches.map(({ detail, role }) => ({
      uid: detail.uid,
      type: "depute" as const,
      label: `${detail.prenom} ${detail.nom}`,
      sublabel: [role, detail.circonscription].filter(Boolean).join(" · "),
    }));
  }

  async getDepute(uid: string): Promise<DeputeDetail | null> {
    const entry = DEMO_DATA[uid];
    if (!entry) return null;
    return {
      ...entry.detail,
      provenance: makeProvenance("POLIGRAPH", `${DEMO_BASE}/personnes/${uid}`, DEMO_LICENCE),
    };
  }

  async getRecentVotesForDepute(uid: string, limit: number): Promise<DeputeVote[]> {
    const entry = DEMO_DATA[uid];
    if (!entry) return [];
    return entry.votes.slice(0, limit).map((v) => ({
      scrutin: { uid: v.uid, date: v.date, titre: v.titre, resultat: v.resultat },
      position: v.position,
      provenance: makeProvenance("POLIGRAPH", `${DEMO_BASE}/scrutins/${v.uid}/votes`, DEMO_LICENCE),
    }));
  }
}
