/**
 * Construction des URL de l'API PoliGraph (Sénat + ministres).
 *
 * ⚠ Les routes exactes de PoliGraph ne sont PAS confirmées dans ce dépôt. Comme
 * pour CIVIX, calez-les sur des réponses réelles via un diagnostic `probe` avant
 * d'activer le mode LIVE en production. La base est surchargée par
 * l'environnement (`POLIGRAPH_BASE`).
 */

export const POLIGRAPH_BASE = process.env.POLIGRAPH_BASE ?? "https://www.poligraph.fr";
export const POLIGRAPH_API = `${POLIGRAPH_BASE}/api/v1`;
export const POLIGRAPH_LICENCE = "Licence Ouverte 2.0";

function withQuery(path: string, params: Record<string, string | number | undefined>): string {
  const url = new URL(`${POLIGRAPH_API}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/** Routes PROBABLES (à confirmer via probe). */
export const poligraphUrl = {
  search: (q: string) => withQuery("/search", { search: q }),
  personne: (uid: string) => `${POLIGRAPH_API}/personnes/${encodeURIComponent(uid)}`,
  scrutins: (pageSize?: number) => withQuery("/scrutins", { page_size: pageSize }),
  scrutinVotes: (uid: string) =>
    `${POLIGRAPH_API}/scrutins/${encodeURIComponent(uid)}/votes`,
} as const;
