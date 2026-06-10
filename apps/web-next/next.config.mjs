import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Charge le .env de la RACINE du monorepo (dev/local) : LEGIFRANCE_CLIENT_ID, etc.
// En prod (Vercel), les variables viennent du dashboard → ce chargement est ignoré.
config({ path: join(dirname(fileURLToPath(import.meta.url)), "..", "..", ".env") });

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Les packages de l'espace de travail sont du TS source : Next doit les transpiler.
  transpilePackages: [
    "@app/schema",
    "@app/core",
    "@app/connectors-base",
    "@app/connectors-civix",
    "@app/connectors-poligraph",
    "@app/connectors-gouvernement",
    "@app/connectors-senat",
    "@app/connectors-hatvp",
    "@app/connectors-legifrance",
    "@app/connectors-assemblee",
    "@app/reconciliation",
    "@app/db",
  ],
  // @prisma/client doit rester externe (binaire/résolution spéciale).
  // adm-zip est volontairement ABSENT ici → Next le bundle dans la fonction
  // (pur JS), ce qui évite les "module not found" en serverless Vercel.
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client"],
  },
  // Les packages @app/* utilisent des imports en ".js" (style NodeNext) qui
  // pointent vers des fichiers ".ts". On apprend à webpack à les résoudre.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;
