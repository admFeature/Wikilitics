/**
 * Backend Fastify — API INTERNE consommée par le frontend.
 *
 * Le frontend ne parle JAMAIS aux sources externes : il passe par ici.
 * Endpoints :
 *   GET /api/about
 *   GET /api/search?q=...
 *   GET /api/deputes/:uid
 *   GET /api/deputes/:uid/votes?limit=8
 */
// Charge le .env de la RACINE du monorepo AVANT tout le reste (doit rester le
// 1er import) : DATABASE_URL Supabase, CIVIX_LIVE… même lancé depuis apps/api.
import "./load-env.js";
import Fastify from "fastify";
import { z } from "zod";
import { UpstreamError } from "@app/connectors-base";
import { ConnectorRegistry } from "./registry.js";

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? "127.0.0.1";

const registry = new ConnectorRegistry();

const app = Fastify({
  logger: { transport: undefined, level: process.env.LOG_LEVEL ?? "info" },
});

/* ------------------------------------------------------------------ */
/* Validation des entrées                                              */
/* ------------------------------------------------------------------ */

const SearchQuery = z.object({ q: z.string().trim().min(1, "Paramètre q requis") });
const UidParams = z.object({ uid: z.string().min(1) });
const VotesQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(8),
});

/* ------------------------------------------------------------------ */
/* Routes                                                              */
/* ------------------------------------------------------------------ */

app.get("/api/about", async () => registry.about());

app.get("/api/search", async (req, reply) => {
  const parsed = SearchQuery.safeParse(req.query);
  if (!parsed.success) {
    return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Requête invalide" });
  }
  return registry.search(parsed.data.q);
});

app.get("/api/deputes/:uid", async (req, reply) => {
  const parsed = UidParams.safeParse(req.params);
  if (!parsed.success) {
    return reply.code(400).send({ error: "uid invalide" });
  }
  const depute = await registry.getDepute(parsed.data.uid);
  if (!depute) {
    return reply.code(404).send({ error: "Personnalité introuvable" });
  }
  return depute;
});

app.get("/api/deputes/:uid/votes", async (req, reply) => {
  const params = UidParams.safeParse(req.params);
  if (!params.success) {
    return reply.code(400).send({ error: "uid invalide" });
  }
  const query = VotesQuery.safeParse(req.query);
  if (!query.success) {
    return reply.code(400).send({ error: "Paramètre limit invalide" });
  }
  return registry.getVotes(params.data.uid, query.data.limit);
});

/* ------------------------------------------------------------------ */
/* Gestion d'erreurs : jamais opaque                                  */
/* ------------------------------------------------------------------ */

app.setErrorHandler((error, req, reply) => {
  if (error instanceof UpstreamError) {
    // On remonte un message LISIBLE (url + statut + extrait) au frontend.
    req.log.error({ err: error }, "Erreur source amont");
    return reply.code(502).send({
      error: "Échec de la source externe",
      detail: error.message,
      upstream: {
        url: error.url,
        status: error.status ?? null,
        contentType: error.contentType ?? null,
        bodySnippet: error.bodySnippet ?? null,
      },
    });
  }
  req.log.error({ err: error }, "Erreur interne");
  const detail = error instanceof Error ? error.message : String(error);
  return reply.code(500).send({ error: "Erreur interne", detail });
});

/* ------------------------------------------------------------------ */
/* Démarrage                                                          */
/* ------------------------------------------------------------------ */

async function main(): Promise<void> {
  const a = registry.about();
  await app.listen({ port: PORT, host: HOST });
  app.log.info(`API prête sur http://${HOST}:${PORT} — ${a.base}, persistance ${a.persistence ? "active" : "off"}`);
  // Préchauffe en tâche de fond : annuaire CIVIX (1re frappe instantanée) +
  // index des votes nominatifs de l'Assemblée (1er affichage de votes rapide).
  void registry.search("warmup").catch(() => undefined);
  void registry.warmAssemblee();
}

main().catch((err) => {
  app.log.error(err);
  process.exit(1);
});
