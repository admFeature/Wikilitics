/**
 * @app/connectors-viepublique — discours publics récents (open data DILA).
 *
 * On télécharge une TRANCHE récente du jeu (range request ~6 Mo sur 241 Mo,
 * trié du plus récent au plus ancien), on indexe les discours par nom
 * d'intervenant, et on les ressert sur les fiches (surtout ministres / PM /
 * président). Données réelles, tracées (Licence Ouverte). Cache /tmp.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeProvenance } from "@app/connectors-base";
import type { DiscoursItem } from "@app/schema";
import { parsePartialArray, toDiscours, normName, type RawDiscours } from "./parse.js";

export { parsePartialArray, toDiscours, normName } from "./parse.js";

const URL_FULL = "https://echanges.dila.gouv.fr/OPENDATA/DISCOURS_PUBLICS/vp_discours.json";
const SOURCE_URL = "https://www.data.gouv.fr/datasets/metadonnees-des-discours-publics-de-vie-publique-fr";
const LICENCE = "Licence Ouverte 2.0";
const CACHE_FILE = join(tmpdir(), "wikilitic-vp-discours-slice.json");
const SLICE_BYTES = Number(process.env.VP_DISCOURS_BYTES ?? 6_000_000);
const MAX_PER_PERSON = 12;

export class ViePubliqueDiscoursIndex {
  private ready: Promise<void> | null = null;
  private byName = new Map<string, DiscoursItem[]>();

  load(): Promise<void> {
    if (!this.ready) this.ready = this.build();
    return this.ready;
  }

  get size(): number {
    return this.byName.size;
  }

  /** Derniers discours d'une personne (par nom complet). */
  getDiscours(prenom: string, nom: string, limit = 8): DiscoursItem[] {
    const list = this.byName.get(normName(`${prenom} ${nom}`));
    return list ? list.slice(0, limit) : [];
  }

  private async loadSlice(): Promise<string> {
    const override = process.env.VP_DISCOURS_SLICE_PATH;
    if (override && existsSync(override)) return readFileSync(override, "utf8");
    if (existsSync(CACHE_FILE)) {
      try {
        return readFileSync(CACHE_FILE, "utf8");
      } catch {
        /* cache illisible : on retélécharge */
      }
    }
    const res = await fetch(URL_FULL, { headers: { Range: `bytes=0-${SLICE_BYTES}` } });
    if (!res.ok && res.status !== 206) throw new Error(`Téléchargement discours échoué : HTTP ${res.status}`);
    const text = await res.text();
    try {
      writeFileSync(CACHE_FILE, text);
    } catch {
      /* cache non écrit : pas bloquant */
    }
    return text;
  }

  private async build(): Promise<void> {
    const slice = await this.loadSlice();
    const objects = parsePartialArray(slice) as RawDiscours[];
    const byName = new Map<string, DiscoursItem[]>();
    for (const raw of objects) {
      const d = toDiscours(raw);
      if (!d) continue;
      const item: DiscoursItem = {
        titre: d.titre,
        ...(d.date ? { date: d.date } : {}),
        url: d.url,
        provenance: makeProvenance("VIE_PUBLIQUE", SOURCE_URL, LICENCE),
      };
      for (const nom of d.intervenants) {
        const key = normName(nom);
        const arr = byName.get(key) ?? [];
        if (arr.length < MAX_PER_PERSON) arr.push(item);
        byName.set(key, arr);
      }
    }
    // Les discours sont déjà du plus récent au plus ancien (ordre du fichier).
    this.byName = byName;
  }
}
