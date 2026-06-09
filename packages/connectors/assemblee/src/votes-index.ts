/**
 * Index EN MÉMOIRE des votes nominatifs de l'Assemblée nationale.
 *
 * Même esprit que l'annuaire CIVIX préchargé : on télécharge une fois le jeu
 * « Scrutins » de l'open data AN, on garde en mémoire les N scrutins récents et
 * un index `acteurRef → votes`, et on sert les votes d'une personne SANS base de
 * données. (La persistance Postgres/Supabase reste possible mais facultative.)
 *
 * Le zip est mis en cache disque (tmp) pour accélérer les redémarrages.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DeputeVote, Provenance, VotePosition } from "@app/schema";
import {
  parseScrutin,
  scrutinSourceUrl,
  SCRUTINS_ZIP_URL,
  ASSEMBLEE_LICENCE,
} from "./an-scrutins.js";

interface ScrutinHeader {
  uid: string;
  numero: number | null;
  date: string | undefined;
  titre: string;
  resultat: string | undefined;
}

const CACHE_FILE = join(tmpdir(), "wikilitic-an-scrutins.json.zip");

function numeroFromName(name: string): number {
  const m = /V(\d+)\.json$/.exec(name);
  return m ? Number(m[1]) : 0;
}

export class AssembleeVotesIndex {
  private ready: Promise<void> | null = null;
  private scrutins: ScrutinHeader[] = [];
  private byActeur = new Map<string, Array<{ i: number; position: VotePosition }>>();
  private readonly maxScrutins: number;

  constructor(opts: { maxScrutins?: number } = {}) {
    this.maxScrutins =
      opts.maxScrutins ?? Number(process.env.ASSEMBLEE_MAX_SCRUTINS ?? 500);
  }

  /** Charge l'index une seule fois (mémoïsé). */
  load(): Promise<void> {
    if (!this.ready) this.ready = this.build();
    return this.ready;
  }

  /** Nb d'acteurs indexés (0 tant que non chargé). */
  get acteurCount(): number {
    return this.byActeur.size;
  }

  private async loadZipBuffer(): Promise<Buffer> {
    const override = process.env.AN_ZIP_PATH;
    if (override && existsSync(override)) return readFileSync(override);
    if (existsSync(CACHE_FILE)) {
      try {
        return readFileSync(CACHE_FILE);
      } catch {
        /* cache illisible : on retélécharge */
      }
    }
    const res = await fetch(SCRUTINS_ZIP_URL);
    if (!res.ok) throw new Error(`Téléchargement Assemblée échoué : HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    try {
      writeFileSync(CACHE_FILE, buf);
    } catch {
      /* cache non écrit (ex. FS readonly) : pas bloquant */
    }
    return buf;
  }

  private async build(): Promise<void> {
    // Import paresseux d'adm-zip : ne charge la lib QUE lors de la construction
    // de l'index (et pas au chargement du module → routes /about, /search OK).
    const { default: AdmZip } = await import("adm-zip");
    const zip = new AdmZip(await this.loadZipBuffer());
    const entries = zip
      .getEntries()
      .filter((e) => /VTANR.*\.json$/.test(e.entryName))
      .sort((a, b) => numeroFromName(b.entryName) - numeroFromName(a.entryName))
      .slice(0, this.maxScrutins);

    const scrutins: ScrutinHeader[] = [];
    const byActeur = new Map<string, Array<{ i: number; position: VotePosition }>>();

    for (const e of entries) {
      let parsed;
      try {
        parsed = parseScrutin(JSON.parse(e.getData().toString("utf8")));
      } catch {
        continue;
      }
      if (!parsed || parsed.votes.length === 0) continue;
      const i = scrutins.length;
      scrutins.push({
        uid: parsed.uid,
        numero: parsed.numero,
        date: parsed.date,
        titre: parsed.titre,
        resultat: parsed.resultat,
      });
      for (const v of parsed.votes) {
        let list = byActeur.get(v.acteurRef);
        if (!list) {
          list = [];
          byActeur.set(v.acteurRef, list);
        }
        list.push({ i, position: v.position });
      }
    }

    this.scrutins = scrutins;
    this.byActeur = byActeur;
  }

  /**
   * Derniers votes nominatifs d'un acteur (uid « PA… », identique à CIVIX),
   * au format domaine, du plus récent au plus ancien.
   */
  getVotes(acteurRef: string, limit: number): DeputeVote[] {
    const refs = this.byActeur.get(acteurRef);
    if (!refs) return [];
    const out: DeputeVote[] = [];
    for (const r of refs.slice(0, limit)) {
      const s = this.scrutins[r.i];
      if (!s) continue;
      const provenance: Provenance = {
        source: "ASSEMBLEE",
        sourceUrl: scrutinSourceUrl(s.numero),
        collectedAt: new Date().toISOString(),
        licence: ASSEMBLEE_LICENCE,
      };
      out.push({
        scrutin: {
          uid: s.uid,
          titre: s.titre,
          ...(s.date ? { date: s.date } : {}),
          ...(s.resultat ? { resultat: s.resultat } : {}),
        },
        position: r.position,
        provenance,
      });
    }
    return out;
  }
}
