/**
 * Construction des URL de l'API CIVIX.
 * Base : https://www.civix.fr — routes sous /api/v1 — lecture seule, sans auth.
 */

export const CIVIX_BASE = "https://www.civix.fr";
export const CIVIX_API = `${CIVIX_BASE}/api/v1`;
export const CIVIX_LICENCE = "Licence Ouverte 2.0";

function withQuery(path: string, params: Record<string, string | number | undefined>): string {
  const url = new URL(`${CIVIX_API}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/**
 * Routes de l'API CIVIX.
 *
 * NB calé sur réponses réelles (cf. `pnpm probe`) :
 *  - la recherche attend le paramètre `search` (et non `q`) ;
 *  - la pagination des listes se fait via `page_size` (le `limit` est ignoré).
 */
export const civixUrl = {
  search: (q: string) => withQuery("/search", { search: q }),
  deputes: () => `${CIVIX_API}/deputes`,
  deputesPage: (page: number, pageSize: number) =>
    withQuery("/deputes", { page, page_size: pageSize }),
  depute: (uid: string) => `${CIVIX_API}/deputes/${encodeURIComponent(uid)}`,
  scrutins: (pageSize?: number) => withQuery("/scrutins", { page_size: pageSize }),
  scrutin: (uid: string) => `${CIVIX_API}/scrutins/${encodeURIComponent(uid)}`,
  scrutinVotes: (uid: string) =>
    `${CIVIX_API}/scrutins/${encodeURIComponent(uid)}/votes`,
  groupes: () => `${CIVIX_API}/groupes`,
  groupe: (abbr: string) => `${CIVIX_API}/groupes/${encodeURIComponent(abbr)}`,
} as const;

/**
 * IMPORTANT : il n'existe PAS de route /deputes/{uid}/votes.
 * Les votes sont rangés par scrutin ; voir getRecentVotesForDepute.
 */
