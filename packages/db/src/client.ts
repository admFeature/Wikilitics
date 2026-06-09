/**
 * Accès Prisma — singleton paresseux + détection de configuration.
 *
 * La persistance est OPTIONNELLE : sans `DATABASE_URL`, l'application
 * fonctionne en mode purement connecteur (cf. phase 1). On n'instancie le
 * client (et donc on ne tente une connexion) que si une base est configurée.
 */
import { PrismaClient } from "@prisma/client";

let singleton: PrismaClient | undefined;

/** Vrai si une base de données est configurée via l'environnement. */
export function isDbConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return typeof env.DATABASE_URL === "string" && env.DATABASE_URL.trim() !== "";
}

/** Renvoie le client Prisma (créé à la première demande). */
export function getPrisma(): PrismaClient {
  if (!singleton) {
    singleton = new PrismaClient();
  }
  return singleton;
}

/** Ferme la connexion (utile en tests / arrêt propre). */
export async function disconnectPrisma(): Promise<void> {
  if (singleton) {
    await singleton.$disconnect();
    singleton = undefined;
  }
}
