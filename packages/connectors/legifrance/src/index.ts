/**
 * @app/connectors-legifrance — recherche de textes de loi via l'API PISTE/DILA.
 *
 * Auth : OAuth2 client_credentials (token mis en cache jusqu'à expiration).
 * Identifiants : LEGIFRANCE_CLIENT_ID / LEGIFRANCE_CLIENT_SECRET (env / Vercel).
 *
 * Recherche dans le fonds LODA (lois, ordonnances, décrets, arrêtés).
 * NB : les décisions de justice Légifrance sont ANONYMISÉES → non rattachées à
 * une personne nommée. On expose ici une recherche de TEXTES, pas de personnes.
 */
import type { LegifranceText } from "@app/schema";
import { mapResult } from "./mapping.js";

export { mapResult, cleanTitle, legifranceUrl } from "./mapping.js";

const OAUTH_URL = "https://oauth.piste.gouv.fr/api/oauth/token";
const API_BASE = "https://api.piste.gouv.fr/dila/legifrance/lf-engine-app";

function creds(env: NodeJS.ProcessEnv = process.env): { id: string; secret: string } | null {
  const id = env.LEGIFRANCE_CLIENT_ID ?? env.client_id;
  const secret = env.LEGIFRANCE_CLIENT_SECRET ?? env.client_secret;
  return id && secret ? { id, secret } : null;
}

/** Vrai si les identifiants Légifrance sont configurés. */
export function isLegifranceConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return creds(env) !== null;
}

/* --- Token OAuth (cache mémoire jusqu'à expiration) --- */
let cachedToken: { value: string; expiresAt: number } | undefined;

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 30_000) {
    return cachedToken.value;
  }
  const c = creds();
  if (!c) throw new Error("Identifiants Légifrance absents (LEGIFRANCE_CLIENT_ID/SECRET)");
  const res = await fetch(OAUTH_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: c.id,
      client_secret: c.secret,
      scope: "openid",
    }),
  });
  if (!res.ok) throw new Error(`OAuth Légifrance échoué : HTTP ${res.status}`);
  const j = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!j.access_token) throw new Error("Token Légifrance manquant dans la réponse OAuth");
  cachedToken = {
    value: j.access_token,
    expiresAt: Date.now() + (j.expires_in ?? 3600) * 1000,
  };
  return cachedToken.value;
}

/**
 * Recherche des textes de loi par mots du titre (fonds LODA).
 * Renvoie [] si non configuré (dégrade sans casser).
 */
export async function searchTextes(query: string, limit = 6): Promise<LegifranceText[]> {
  const q = query.trim();
  if (q === "" || !isLegifranceConfigured()) return [];

  const token = await getToken();
  const body = {
    fond: "LODA_DATE",
    recherche: {
      pageNumber: 1,
      pageSize: Math.min(Math.max(limit, 1), 20),
      operateur: "ET",
      sort: "PERTINENCE",
      typePagination: "DEFAUT",
      secondSort: "ID",
      filtres: [],
      champs: [
        {
          typeChamp: "TITLE",
          operateur: "ET",
          criteres: [
            { typeRecherche: "UN_DES_MOTS", valeur: q, operateur: "ET", proximite: 0, criteres: [] },
          ],
        },
      ],
    },
  };

  const res = await fetch(`${API_BASE}/search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Recherche Légifrance échouée : HTTP ${res.status}`);
  const j = (await res.json()) as { results?: unknown[] };
  const out: LegifranceText[] = [];
  for (const r of j.results ?? []) {
    const mapped = mapResult(r);
    if (mapped) out.push(mapped);
  }
  return out;
}
