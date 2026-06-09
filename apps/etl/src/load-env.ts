import { config } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

/** Charge le `.env` du monorepo en remontant depuis le cwd (silencieux si absent). */
export function loadRootEnv(): void {
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, ".env");
    if (existsSync(candidate)) {
      config({ path: candidate });
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
}

// Exécuté dès l'import (placer `import "./load-env.js"` en TOUT PREMIER).
loadRootEnv();
