/**
 * Client HTTP JSON robuste, partagé par tous les connecteurs LIVE.
 *
 * Robustesse réseau OBLIGATOIRE :
 *  - après `fetch`, on vérifie le statut ; si non-2xx → UpstreamError lisible.
 *  - on vérifie le `content-type` ; si ce n'est pas du JSON (cas fréquent :
 *    une SPA qui renvoie du HTML en 200) → UpstreamError contenant l'URL,
 *    le statut et les 200 premiers caractères du corps.
 */
import { UpstreamError, snippet } from "./errors.js";

export interface JsonFetchOptions {
  /** Délai max avant abandon (ms). */
  timeoutMs?: number;
  /** En-têtes additionnels. */
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Récupère et parse une réponse JSON, en échouant de façon explicite.
 * Le type de retour est `unknown` : la normalisation/validation est faite
 * en aval (Zod ou fonctions `pick`/`asArray`).
 */
export async function jsonFetch(
  url: string,
  opts: JsonFetchOptions = {},
): Promise<unknown> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // Combine un timeout interne avec un éventuel signal externe.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (opts.signal) {
    if (opts.signal.aborted) controller.abort();
    else opts.signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { accept: "application/json", ...opts.headers },
      signal: controller.signal,
    });
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new UpstreamError(`Échec réseau lors de l'appel (${reason})`, { url });
  } finally {
    clearTimeout(timer);
  }

  // Lecture du corps en texte d'abord : permet un message d'erreur utile
  // même si le JSON est invalide ou si on a reçu du HTML.
  const rawBody = await res.text().catch(() => "");
  const contentType = res.headers.get("content-type");

  if (!res.ok) {
    throw new UpstreamError("Réponse en erreur de la source", {
      url,
      status: res.status,
      contentType,
      bodySnippet: snippet(rawBody),
    });
  }

  if (!contentType || !contentType.toLowerCase().includes("json")) {
    throw new UpstreamError(
      "Réponse non-JSON (probable page HTML d'une SPA renvoyée en 200)",
      { url, status: res.status, contentType, bodySnippet: snippet(rawBody) },
    );
  }

  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    throw new UpstreamError("JSON invalide reçu de la source", {
      url,
      status: res.status,
      contentType,
      bodySnippet: snippet(rawBody),
    });
  }
}
