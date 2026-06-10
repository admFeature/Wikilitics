/**
 * @app/connectors-hatvp — index EN MÉMOIRE des déclarations d'INTÉRÊTS HATVP.
 *
 * Enrichit les fiches d'un LIEN SORTANT vers la déclaration d'intérêts officielle
 * (jamais le patrimoine — voir conformité dans parse.ts). Données open data,
 * licence Etalab. Mise en cache /tmp.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseListeCsv, normName, type HatvpMandat } from "./parse.js";

export { HATVP_BASE, HATVP_LICENCE, isInteret, parseListeCsv, normName } from "./parse.js";
export type { HatvpInteret, HatvpMandat } from "./parse.js";

const CSV_URL = "https://www.hatvp.fr/livraison/opendata/liste.csv";
const CACHE_FILE = join(tmpdir(), "wikilitic-hatvp-liste.csv");

export class HatvpInteretsIndex {
  private ready: Promise<void> | null = null;
  /** clé `${normName}|${mandat}` → URL de la déclaration d'intérêts. */
  private byKey = new Map<string, string>();
  /** repli : `${normName}` → URL (si le mandat ne matche pas exactement). */
  private byName = new Map<string, string>();

  load(): Promise<void> {
    if (!this.ready) this.ready = this.build();
    return this.ready;
  }

  get size(): number {
    return this.byKey.size;
  }

  /** URL de la déclaration d'INTÉRÊTS d'une personne, selon son rôle. */
  getInteretsUrl(prenom: string, nom: string, mandat: HatvpMandat): string | undefined {
    const key = normName(prenom, nom);
    return this.byKey.get(`${key}|${mandat}`) ?? this.byName.get(key);
  }

  private async build(): Promise<void> {
    const text = await this.loadCsv();
    const byKey = new Map<string, string>();
    const byName = new Map<string, string>();
    for (const e of parseListeCsv(text)) {
      byKey.set(`${e.key}|${e.mandat}`, e.url);
      if (!byName.has(e.key)) byName.set(e.key, e.url);
    }
    this.byKey = byKey;
    this.byName = byName;
  }

  private async loadCsv(): Promise<string> {
    const override = process.env.HATVP_CSV_PATH;
    if (override && existsSync(override)) return readFileSync(override, "utf8");
    if (existsSync(CACHE_FILE)) {
      try {
        return readFileSync(CACHE_FILE, "utf8");
      } catch {
        /* cache illisible : on retélécharge */
      }
    }
    const res = await fetch(CSV_URL, { headers: { accept: "text/csv" } });
    if (!res.ok) throw new Error(`Téléchargement HATVP échoué : HTTP ${res.status}`);
    const text = await res.text();
    try {
      writeFileSync(CACHE_FILE, text);
    } catch {
      /* cache non écrit : pas bloquant */
    }
    return text;
  }
}
