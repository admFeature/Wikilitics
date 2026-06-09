/**
 * Connecteur CIVIX en mode DÉMO — hors ligne, sans réseau (mode par défaut).
 *
 * ANTI-DÉSINFORMATION : toutes les personnalités et tous les votes ci-dessous
 * sont FICTIFS. Aucun nom réel, aucun vote attribué à une personne réelle.
 * Les URL de provenance pointent vers un domaine d'exemple non officiel.
 */
import { makeProvenance, type SourceConnector } from "@app/connectors-base";
import type {
  DeputeDetail,
  DeputeVote,
  SearchHit,
  VotePosition,
} from "@app/schema";

const DEMO_LICENCE = "Données fictives de démonstration";
const DEMO_BASE = "https://exemple.invalid/civix";

interface DemoDepute {
  detail: Omit<DeputeDetail, "provenance">;
  votes: Array<{
    scrutinUid: string;
    date: string;
    titre: string;
    resultat: string;
    position: VotePosition;
  }>;
}

/* --- Personnalités FICTIVES ---------------------------------------- */

const DEMO_DATA: Record<string, DemoDepute> = {
  "demo-001": {
    detail: {
      uid: "demo-001",
      prenom: "Camille",
      nom: "Durand-Fictif",
      groupe: "Groupe Démonstration et Progrès",
      groupeAbbr: "GDP",
      circonscription: "Exemplie (1re circ.)",
      profession: "Ingénieure (personnage fictif)",
    },
    votes: [
      {
        scrutinUid: "scr-1001",
        date: "2026-05-14",
        titre: "Proposition de loi fictive sur la mobilité douce",
        resultat: "adopté",
        position: "pour",
      },
      {
        scrutinUid: "scr-1002",
        date: "2026-05-07",
        titre: "Amendement fictif relatif au budget des collectivités",
        resultat: "rejeté",
        position: "contre",
      },
      {
        scrutinUid: "scr-1003",
        date: "2026-04-29",
        titre: "Motion fictive sur la transparence des données publiques",
        resultat: "adopté",
        position: "abstention",
      },
    ],
  },
  "demo-002": {
    detail: {
      uid: "demo-002",
      prenom: "Théo",
      nom: "Martin-Exemple",
      groupe: "Groupe des Indépendants Imaginaires",
      groupeAbbr: "GII",
      circonscription: "Fictiville (3e circ.)",
      profession: "Médecin (personnage fictif)",
    },
    votes: [
      {
        scrutinUid: "scr-1001",
        date: "2026-05-14",
        titre: "Proposition de loi fictive sur la mobilité douce",
        resultat: "adopté",
        position: "pour",
      },
      {
        scrutinUid: "scr-1004",
        date: "2026-05-02",
        titre: "Projet de loi fictif sur l'éducation numérique",
        resultat: "adopté",
        position: "pour",
      },
      {
        scrutinUid: "scr-1005",
        date: "2026-04-22",
        titre: "Amendement fictif sur la fiscalité locale",
        resultat: "rejeté",
        position: "nonVotant",
      },
    ],
  },
  "demo-003": {
    detail: {
      uid: "demo-003",
      prenom: "Awa",
      nom: "Sylla-Imaginaire",
      groupe: "Groupe Démonstration et Progrès",
      groupeAbbr: "GDP",
      circonscription: "Exemplie (2e circ.)",
      profession: "Avocate (personnage fictif)",
    },
    votes: [
      {
        scrutinUid: "scr-1002",
        date: "2026-05-07",
        titre: "Amendement fictif relatif au budget des collectivités",
        resultat: "rejeté",
        position: "pour",
      },
      {
        scrutinUid: "scr-1003",
        date: "2026-04-29",
        titre: "Motion fictive sur la transparence des données publiques",
        resultat: "adopté",
        position: "pour",
      },
      {
        scrutinUid: "scr-1006",
        date: "2026-04-15",
        titre: "Proposition de résolution fictive sur la culture",
        resultat: "adopté",
        position: "contre",
      },
    ],
  },
};

export class CivixDemoConnector implements SourceConnector {
  readonly source = "CIVIX" as const;
  readonly isLive = false;

  async search(query: string): Promise<SearchHit[]> {
    const q = query.trim().toLowerCase();
    const all = Object.values(DEMO_DATA);
    const matches = q === ""
      ? all
      : all.filter(({ detail }) =>
          `${detail.prenom} ${detail.nom} ${detail.groupeAbbr ?? ""}`
            .toLowerCase()
            .includes(q),
        );
    return matches.map(({ detail }) => ({
      uid: detail.uid,
      type: "depute" as const,
      label: `${detail.prenom} ${detail.nom}`,
      sublabel: [detail.groupeAbbr, detail.circonscription]
        .filter(Boolean)
        .join(" · "),
    }));
  }

  async getDepute(uid: string): Promise<DeputeDetail | null> {
    const entry = DEMO_DATA[uid];
    if (!entry) return null;
    return {
      ...entry.detail,
      provenance: makeProvenance(
        "CIVIX",
        `${DEMO_BASE}/deputes/${uid}`,
        DEMO_LICENCE,
      ),
    };
  }

  async getRecentVotesForDepute(uid: string, limit: number): Promise<DeputeVote[]> {
    const entry = DEMO_DATA[uid];
    if (!entry) return [];
    return entry.votes.slice(0, limit).map((v) => ({
      scrutin: {
        uid: v.scrutinUid,
        date: v.date,
        titre: v.titre,
        resultat: v.resultat,
      },
      position: v.position,
      provenance: makeProvenance(
        "CIVIX",
        `${DEMO_BASE}/scrutins/${v.scrutinUid}/votes`,
        DEMO_LICENCE,
      ),
    }));
  }
}
