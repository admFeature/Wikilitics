/**
 * Erreurs typées et LISIBLES pour la couche connecteur.
 *
 * Exigence du projet : jamais d'erreur opaque. Toute défaillance réseau ou
 * de format doit contenir l'URL, le statut et un extrait du corps brut.
 */

/** Tronque un corps de réponse pour un message d'erreur lisible. */
export function snippet(body: string, max = 200): string {
  const clean = body.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

export interface UpstreamErrorContext {
  url: string;
  status?: number;
  contentType?: string | null;
  bodySnippet?: string;
}

/**
 * Erreur levée quand une source externe répond de façon inattendue
 * (statut non-2xx, content-type non-JSON, corps illisible…).
 */
export class UpstreamError extends Error {
  readonly url: string;
  readonly status?: number;
  readonly contentType?: string | null;
  readonly bodySnippet?: string;

  constructor(message: string, ctx: UpstreamErrorContext) {
    const parts = [
      message,
      `url=${ctx.url}`,
      ctx.status !== undefined ? `status=${ctx.status}` : null,
      ctx.contentType ? `content-type=${ctx.contentType}` : null,
      ctx.bodySnippet ? `corps="${ctx.bodySnippet}"` : null,
    ].filter(Boolean);
    super(parts.join(" | "));
    this.name = "UpstreamError";
    this.url = ctx.url;
    this.status = ctx.status;
    this.contentType = ctx.contentType;
    this.bodySnippet = ctx.bodySnippet;
  }
}
