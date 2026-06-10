/**
 * @app/connectors-hatvp — index EN MÉMOIRE des déclarations d'INTÉRÊTS HATVP.
 *
 * Deux usages, tous deux sur l'open data (intérêts UNIQUEMENT, jamais le
 * patrimoine — voir conformité dans parse.ts / declaration.ts) :
 *  - un LIEN SORTANT vers la déclaration officielle ;
 *  - le CONTENU des rubriques d'intérêts (déclaration XML individuelle).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { InteretsDeclaration, InteretRubrique } from "@app/schema";
import { parseListeCsv, normName, type HatvpMandat, type HatvpInteret } from "./parse.js";
import { parseDeclarationInterets } from "./declaration.js";

export { HATVP_BASE, HATVP_LICENCE, isInteret, parseListeCsv, normName } from "./parse.js";
export type { HatvpInteret, HatvpMandat } from "./parse.js";
export { parseDeclarationInterets } from "./declaration.js";

const CSV_URL = "https://www.hatvp.fr/livraison/opendata/liste.csv";
const DOSSIERS_BASE = "https://www.hatvp.fr/livraison/dossiers";
const CACHE_FILE = join(tmpdir(), "wikilitic-hatvp-liste.csv");

interface Entry {
  url: string;
  type: string;
  fichier?: string;
}

export class HatvpInteretsIndex {
  private ready: Promise<void> | null = null;
  private byKey = new Map<string, Entry>();
  private byName = new Map<string, Entry>();
  /** cache des déclarations parsées, par nom de fichier. */
  private declCache = new Map<string, InteretsDeclaration>();

  load(): Promise<void> {
    if (!this.ready) this.ready = this.build();
    return this.ready;
  }

  get size(): number {
    return this.byKey.size;
  }

  private entry(prenom: string, nom: string, mandat: HatvpMandat): Entry | undefined {
    const key = normName(prenom, nom);
    return this.byKey.get(`${key}|${mandat}`) ?? this.byName.get(key);
  }

  /** URL de la déclaration d'INTÉRÊTS d'une personne (lien sortant). */
  getInteretsUrl(prenom: string, nom: string, mandat: HatvpMandat): string | undefined {
    return this.entry(prenom, nom, mandat)?.url;
  }

  /**
   * Contenu de la déclaration d'intérêts (rubriques) + lien. Renvoie null si
   * la personne n'a pas de déclaration d'intérêts connue.
   */
  async getDeclaration(prenom: string, nom: string, mandat: HatvpMandat): Promise<InteretsDeclaration | null> {
    const e = this.entry(prenom, nom, mandat);
    if (!e) return null;
    if (!e.fichier) return { url: e.url, type: e.type, rubriques: [] };
    if (this.declCache.has(e.fichier)) return this.declCache.get(e.fichier)!;
    let rubriques: InteretRubrique[];
    try {
      const res = await fetch(`${DOSSIERS_BASE}/${e.fichier}`, { headers: { accept: "application/xml" } });
      rubriques = res.ok ? parseDeclarationInterets(await res.text()) : [];
    } catch {
      rubriques = [];
    }
    const decl: InteretsDeclaration = { url: e.url, type: e.type, rubriques };
    this.declCache.set(e.fichier, decl);
    return decl;
  }

  private async build(): Promise<void> {
    const text = await this.loadCsv();
    const byKey = new Map<string, Entry>();
    const byName = new Map<string, Entry>();
    for (const e of parseListeCsv(text) as HatvpInteret[]) {
      const entry: Entry = { url: e.url, type: e.type, ...(e.fichier ? { fichier: e.fichier } : {}) };
      byKey.set(`${e.key}|${e.mandat}`, entry);
      if (!byName.has(e.key)) byName.set(e.key, entry);
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
