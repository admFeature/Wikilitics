/**
 * Parsing du « Protocole du Gouvernement » (DILA, open data).
 *
 * Source : data.gouv.fr / DILA — XML listant les gouvernements successifs, leurs
 * ministères et leurs ministres (Signataire + Fonction). On extrait le
 * gouvernement le PLUS RÉCENT.
 *
 * ⚠ Le protocole exclut les SECRÉTAIRES D'ÉTAT (ministres au sens strict
 * uniquement). Fonctions PURES, sans dépendance XML (schéma officiel stable).
 */

export interface Ministre {
  /** identifiant stable dérivé du nom (ex. "sebastien-lecornu"). */
  slug: string;
  prenom: string;
  nom: string;
  /** Fonction exacte (ex. "Ministre de l'intérieur"). */
  fonction: string;
  /** Libellé du ministère. */
  ministere: string;
}

export interface Gouvernement {
  date: string; // AAAAMMJJ du décret
  description: string;
  ministres: Ministre[];
}

function decodeEntities(s: string): string {
  return s
    .replace(/<\?Pub[^>]*\?>/g, " ") // instructions typographiques DILA
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block: string, name: string): string | undefined {
  const m = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(block);
  return m ? decodeEntities(m[1] ?? "") : undefined;
}

/** Un token est « en capitales » (donc partie du nom de famille). */
function isUpper(token: string): boolean {
  return /[A-ZÀ-Ÿ]/.test(token) && token === token.toLocaleUpperCase("fr");
}

function titleCaseToken(t: string): string {
  return t
    .split("-")
    .map((p) => (p ? p[0]!.toLocaleUpperCase("fr") + p.slice(1).toLocaleLowerCase("fr") : p))
    .join("-");
}

/** "Sébastien LECORNU" → { prenom: "Sébastien", nom: "Lecornu" }. */
export function splitName(signataire: string): { prenom: string; nom: string } {
  const tokens = signataire.trim().split(/\s+/).filter(Boolean);
  let i = tokens.findIndex(isUpper);
  if (i === -1) i = tokens.length; // aucun mot capitalisé → tout en prénom
  const prenom = tokens.slice(0, i).join(" ");
  const nom = tokens.slice(i).map(titleCaseToken).join(" ");
  // Cas "EMMANUEL MACRON" (tout en capitales) : pas de prénom → on rééquilibre.
  if (prenom === "" && tokens.length >= 2) {
    return {
      prenom: titleCaseToken(tokens[0]!),
      nom: tokens.slice(1).map(titleCaseToken).join(" "),
    };
  }
  return { prenom, nom };
}

export function slugify(prenom: string, nom: string): string {
  return `${prenom} ${nom}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Extrait le gouvernement le plus récent du protocole DILA. */
export function parseGouvernement(xml: string): Gouvernement | null {
  const idx = xml.lastIndexOf("<Gouvernement date=");
  if (idx === -1) return null;
  const block = xml.slice(idx);
  const date = (/<Gouvernement date="(\d+)"/.exec(block) ?? [])[1] ?? "";
  const description = tag(block, "description") ?? "";

  const ministres: Ministre[] = [];
  const seen = new Set<string>();
  for (const mm of block.matchAll(/<Ministere\b[^>]*>([\s\S]*?)<\/Ministere>/g)) {
    const ministereBlock = mm[1] ?? "";
    const ministere = tag(ministereBlock, "Nom") ?? "";
    for (const pm of ministereBlock.matchAll(/<Ministre>([\s\S]*?)<\/Ministre>/g)) {
      const inner = pm[1] ?? "";
      const signataire = tag(inner, "Signataire");
      const fonction = tag(inner, "Fonction") ?? "";
      if (!signataire) continue;
      const { prenom, nom } = splitName(signataire);
      const slug = slugify(prenom, nom);
      if (slug === "" || seen.has(slug)) continue;
      seen.add(slug);
      ministres.push({ slug, prenom, nom, fonction, ministere });
    }
  }
  return { date, description, ministres };
}
