/**
 * Client de l'API interne (route handlers Next, même origine).
 * Réponses validées avec les schémas Zod partagés (@app/schema).
 */
import {
  AboutSchema,
  DeputeDetailSchema,
  DeputeVoteListSchema,
  DiscoursItemListSchema,
  LegifranceTextListSchema,
  SearchHitListSchema,
  type About,
  type DeputeDetail,
  type DeputeVote,
  type DiscoursItem,
  type LegifranceText,
  type SearchHit,
} from "@app/schema";

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
    throw new ApiError("Impossible de joindre le serveur", String(e));
  }
  const body: unknown = await res.json().catch(() => undefined);
  if (!res.ok) {
    const obj = (body ?? {}) as { error?: unknown; detail?: unknown };
    const message = typeof obj.error === "string" ? obj.error : `Erreur ${res.status}`;
    const detail = typeof obj.detail === "string" ? obj.detail : undefined;
    throw new ApiError(message, detail);
  }
  return body;
}

export async function fetchAbout(): Promise<About> {
  return AboutSchema.parse(await getJson("/api/about"));
}

export async function search(q: string): Promise<SearchHit[]> {
  return SearchHitListSchema.parse(await getJson(`/api/search?q=${encodeURIComponent(q)}`));
}

export async function fetchDepute(uid: string): Promise<DeputeDetail> {
  return DeputeDetailSchema.parse(await getJson(`/api/deputes/${encodeURIComponent(uid)}`));
}

export async function fetchVotes(uid: string, limit = 8): Promise<DeputeVote[]> {
  return DeputeVoteListSchema.parse(
    await getJson(`/api/deputes/${encodeURIComponent(uid)}/votes?limit=${limit}`),
  );
}

export async function fetchDiscours(uid: string, limit = 6): Promise<DiscoursItem[]> {
  return DiscoursItemListSchema.parse(
    await getJson(`/api/deputes/${encodeURIComponent(uid)}/discours?limit=${limit}`),
  );
}

export async function searchLegifrance(q: string): Promise<LegifranceText[]> {
  return LegifranceTextListSchema.parse(await getJson(`/api/legifrance/search?q=${encodeURIComponent(q)}`));
}
