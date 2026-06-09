/**
 * Client de l'API INTERNE. Le frontend n'appelle QUE /api/* (jamais les
 * sources externes). Les réponses sont validées avec les schémas Zod partagés.
 */
import {
  AboutSchema,
  DeputeDetailSchema,
  DeputeVoteListSchema,
  SearchHitListSchema,
  type About,
  type DeputeDetail,
  type DeputeVote,
  type SearchHit,
} from "@app/schema";

/** Erreur portant le détail amont lisible (url + statut + extrait). */
export class ApiError extends Error {
  constructor(message: string, readonly detail?: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function getJson(url: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { accept: "application/json" } });
  } catch (e) {
    throw new ApiError("Impossible de joindre le backend", String(e));
  }

  const body: unknown = await res.json().catch(() => undefined);

  if (!res.ok) {
    // Le backend renvoie { error, detail } ; on remonte un message actionnable.
    const obj = (body ?? {}) as { error?: string; detail?: string };
    throw new ApiError(obj.error ?? `Erreur ${res.status}`, obj.detail);
  }
  return body;
}

export async function fetchAbout(): Promise<About> {
  return AboutSchema.parse(await getJson("/api/about"));
}

export async function search(q: string): Promise<SearchHit[]> {
  const url = `/api/search?q=${encodeURIComponent(q)}`;
  return SearchHitListSchema.parse(await getJson(url));
}

export async function fetchDepute(uid: string): Promise<DeputeDetail> {
  const url = `/api/deputes/${encodeURIComponent(uid)}`;
  return DeputeDetailSchema.parse(await getJson(url));
}

export async function fetchVotes(uid: string, limit = 8): Promise<DeputeVote[]> {
  const url = `/api/deputes/${encodeURIComponent(uid)}/votes?limit=${limit}`;
  return DeputeVoteListSchema.parse(await getJson(url));
}
