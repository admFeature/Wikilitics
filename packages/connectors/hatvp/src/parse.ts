/**
 * Parsing de la liste open data HATVP (liste.csv) — fonctions PURES.
 *
 * ====================================================================
 *  CONFORMITÉ (NON NÉGOCIABLE)
 * ====================================================================
 * On ne retient QUE les déclarations d'INTÉRÊTS/activités
 * (type_document commençant par "di" : di, dia, diam, dim…).
 * On EXCLUT TOTALEMENT la situation PATRIMONIALE (type_document "dsp*" :
 * dsp, dspm, dspfm) : interdite de republication (sanction pénale).
 * On ne stocke qu'un LIEN SORTANT vers la page officielle HATVP.
 */

export const HATVP_BASE = "https://www.hatvp.fr";
export const HATVP_LICENCE = "Licence Ouverte / Etalab";

/** Rôle exploité par l'app (aligné sur la colonne type_mandat). */
export type HatvpMandat = "depute" | "senateur" | "gouvernement";

export interface HatvpInteret {
  /** clé normalisée "prenom nom". */
  key: string;
  mandat: string; // type_mandat brut (depute, senateur, gouvernement, …)
  /** URL de la page nominative HATVP (lien sortant). */
  url: string;
  /** type_document (di, dia, …) — toujours un type d'INTÉRÊTS. */
  type: string;
  /** Nom du fichier XML open data (contenu de la déclaration), si livré. */
  fichier?: string;
}

export function normName(prenom: string, nom: string): string {
  return `${prenom} ${nom}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Vrai si le type de document est une déclaration d'INTÉRÊTS (jamais patrimoine). */
export function isInteret(typeDocument: string): boolean {
  const t = typeDocument.toLowerCase();
  return t.startsWith("di") && !t.startsWith("dsp");
}

/** Parse le CSV HATVP → entrées d'INTÉRÊTS uniquement (patrimoine exclu). */
export function parseListeCsv(text: string): HatvpInteret[] {
  const lines = text.split(/\r?\n/).filter((l) => l !== "");
  if (lines.length < 2) return [];
  const header = lines[0]!.split(";");
  const idx = (name: string) => header.indexOf(name);
  const iPrenom = idx("prenom");
  const iNom = idx("nom");
  const iMandat = idx("type_mandat");
  const iDoc = idx("type_document");
  const iUrl = idx("url_dossier");
  const iFichier = idx("open_data");
  if (iPrenom < 0 || iNom < 0 || iDoc < 0 || iUrl < 0) return [];

  const out: HatvpInteret[] = [];
  for (const line of lines.slice(1)) {
    const c = line.split(";");
    const type = (c[iDoc] ?? "").trim();
    if (!isInteret(type)) continue; // ⛔ exclut tout patrimoine (dsp*)
    const urlDossier = (c[iUrl] ?? "").trim();
    if (urlDossier === "") continue;
    const prenom = (c[iPrenom] ?? "").trim();
    const nom = (c[iNom] ?? "").trim();
    if (prenom === "" && nom === "") continue;
    const fichier = iFichier >= 0 ? (c[iFichier] ?? "").trim() : "";
    out.push({
      key: normName(prenom, nom),
      mandat: (c[iMandat] ?? "").trim(),
      url: urlDossier.startsWith("http") ? urlDossier : `${HATVP_BASE}${urlDossier}`,
      type,
      ...(fichier.endsWith(".xml") ? { fichier } : {}),
    });
  }
  return out;
}
