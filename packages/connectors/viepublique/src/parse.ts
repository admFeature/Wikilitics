/**
 * Parsing du jeu « Discours publics » de vie-publique.fr (DILA) — fonctions PURES.
 *
 * Le fichier complet fait ~241 Mo (tableau JSON trié du plus RÉCENT au plus
 * ancien). On n'en télécharge qu'une TRANCHE (range request) : le parseur
 * ci-dessous lit les objets de 1er niveau COMPLETS et ignore le dernier objet
 * tronqué par la coupure.
 */

export interface RawDiscours {
  titre?: string;
  url?: string;
  prononciation?: string; // YYYY-MM-DD
  intervenants?: Array<{ nom?: string | null }>;
}

export interface DiscoursLie {
  titre: string;
  date: string | undefined;
  url: string;
  intervenants: string[];
}

export function normName(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Parse un tableau JSON éventuellement TRONQUÉ : extrait les objets de 1er
 * niveau complets (suivi de profondeur, en respectant les chaînes/échappements).
 */
export function parsePartialArray(str: string): unknown[] {
  const out: unknown[] = [];
  let depth = 0;
  let start = -1;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
    } else if (c === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0 && start >= 0) {
        try {
          out.push(JSON.parse(str.slice(start, i + 1)));
        } catch {
          /* objet illisible : on ignore */
        }
        start = -1;
      }
    }
  }
  return out;
}

/** Mappe un objet brut → discours normalisé (null si inexploitable). */
export function toDiscours(raw: RawDiscours): DiscoursLie | null {
  const titre = typeof raw.titre === "string" ? raw.titre.trim() : "";
  const url = typeof raw.url === "string" ? raw.url : "";
  if (titre === "" || url === "") return null;
  const intervenants = (raw.intervenants ?? [])
    .map((i) => (typeof i?.nom === "string" ? i.nom : ""))
    .filter((n) => n !== "");
  return {
    titre,
    date: typeof raw.prononciation === "string" ? raw.prononciation : undefined,
    url,
    intervenants,
  };
}
