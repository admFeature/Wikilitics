/**
 * Connecteur Gouvernement (ministres) — source open data DILA via data.gouv.fr.
 *
 * Charge une fois le « Protocole du Gouvernement » (XML), extrait les ministres
 * du gouvernement le plus récent, et les expose via l'interface SourceConnector
 * (recherche / fiche). Les ministres ne votent pas à l'Assemblée → votes vides.
 *
 * Données réelles, tracées (Licence Ouverte). Mis en cache /tmp.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeProvenance, type SourceConnector } from "@app/connectors-base";
import type { DeputeDetail, DeputeVote, SearchHit } from "@app/schema";
import { parseGouvernement, type Ministre } from "./parse.js";

const DATASET_API = "https://www.data.gouv.fr/api/1/datasets/protocole-du-gouvernement/";
const FALLBACK_XML =
  "https://echanges.dila.gouv.fr/OPENDATA/Protocole_du_Gouvernement/DILA-Gouvernement_protocole-20260416.xml";
const SOURCE_URL = "https://www.data.gouv.fr/datasets/protocole-du-gouvernement";
const LICENCE = "Licence Ouverte 2.0";
const CACHE_FILE = join(tmpdir(), "wikilitic-gouv.xml");

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export class GouvernementConnector implements SourceConnector {
  readonly source = "GOUVERNEMENT" as const;
  readonly isLive = true;

  private ready: Promise<void> | null = null;
  private ministres: Ministre[] = [];
  private bySlug = new Map<string, Ministre>();

  private load(): Promise<void> {
    if (!this.ready) this.ready = this.build();
    return this.ready;
  }

  async search(query: string): Promise<SearchHit[]> {
    await this.load();
    const q = normalize(query.trim());
    if (q === "") return [];
    return this.ministres
      .filter((m) => normalize(`${m.prenom} ${m.nom} ${m.fonction}`).includes(q))
      .slice(0, 12)
      .map((m) => ({
        uid: m.slug,
        type: "depute" as const,
        label: `${m.prenom} ${m.nom}`.trim(),
        sublabel: m.fonction || "Membre du Gouvernement",
      }));
  }

  async getDepute(uid: string): Promise<DeputeDetail | null> {
    await this.load();
    const m = this.bySlug.get(uid);
    if (!m) return null;
    return {
      uid: m.slug,
      prenom: m.prenom,
      nom: m.nom,
      groupe: "Gouvernement",
      groupeAbbr: "GOUV",
      membreGouvernement: true,
      ...(m.fonction ? { roleGouvernement: m.fonction } : {}),
      provenance: makeProvenance("GOUVERNEMENT", SOURCE_URL, LICENCE),
    };
  }

  async getRecentVotesForDepute(): Promise<DeputeVote[]> {
    return []; // les membres du Gouvernement ne votent pas à l'Assemblée.
  }

  /* --- chargement --- */

  private async build(): Promise<void> {
    const xml = await this.loadXml();
    const gouv = parseGouvernement(xml);
    this.ministres = gouv?.ministres ?? [];
    this.bySlug = new Map(this.ministres.map((m) => [m.slug, m]));
  }

  private async loadXml(): Promise<string> {
    const override = process.env.GOUV_XML_PATH;
    if (override && existsSync(override)) return readFileSync(override, "utf8");
    if (existsSync(CACHE_FILE)) {
      try {
        return readFileSync(CACHE_FILE, "utf8");
      } catch {
        /* cache illisible : on retélécharge */
      }
    }
    const url = await this.resolveLatestUrl();
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Téléchargement protocole gouvernement échoué : HTTP ${res.status}`);
    const xml = await res.text();
    try {
      writeFileSync(CACHE_FILE, xml);
    } catch {
      /* cache non écrit : pas bloquant */
    }
    return xml;
  }

  /** Résout l'URL du dernier XML via l'API data.gouv (robuste aux remaniements). */
  private async resolveLatestUrl(): Promise<string> {
    try {
      const res = await fetch(DATASET_API, { headers: { accept: "application/json" } });
      if (res.ok) {
        const data = (await res.json()) as { resources?: Array<{ url?: string; format?: string }> };
        const xmlRes = (data.resources ?? []).find(
          (r) => r.format?.toLowerCase() === "xml" || r.url?.toLowerCase().endsWith(".xml"),
        );
        if (xmlRes?.url) return xmlRes.url;
      }
    } catch {
      /* API indisponible : on retombe sur l'URL connue */
    }
    return FALLBACK_XML;
  }
}

export function createGouvernementConnector(): SourceConnector {
  return new GouvernementConnector();
}
